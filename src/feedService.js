const Parser = require("rss-parser");
const dayjs = require("dayjs");
const { analyzeAndFilterArticles } = require("./analyzer");
const {
  ensureDb,
  getSettings,
  updateSettings,
  saveSnapshot,
  getLatestSnapshot
} = require("./storage");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "GoodVibrationsNews/1.0"
  }
});

const FEEDS = [
  { label: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { label: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { label: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { label: "WIRED", url: "https://www.wired.com/feed/rss" },
  { label: "Phys.org", url: "https://phys.org/rss-feed/" },
  { label: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/" },
  { label: "Raspberry Pi", url: "https://www.raspberrypi.com/feed/" },
  { label: "Arduino", url: "https://blog.arduino.cc/feed/" },
  { label: "Hackaday", url: "https://hackaday.com/blog/feed/" },
  { label: "Adafruit", url: "https://blog.adafruit.com/feed/" },
  { label: "Make", url: "https://makezine.com/feed/" },
  { label: "MIT Tech Review", url: "https://www.technologyreview.com/feed/" },
  { label: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
  { label: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { label: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { label: "Engadget", url: "https://www.engadget.com/rss.xml" },
  { label: "IGN", url: "https://feeds.ign.com/ign/all" },
  { label: "GameSpot", url: "https://www.gamespot.com/feeds/mashup/" },
  { label: "Eurogamer", url: "https://www.eurogamer.net/feed" },
  { label: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/" },
  { label: "Positive News", url: "https://www.positive.news/feed/" }
];

const cache = {
  updatedAt: null,
  articles: [],
  feedStats: [],
  settings: null
};

const feedState = new Map(
  FEEDS.map((feed) => [feed.url, { failures: 0, nextAllowedAt: 0 }])
);

function getBackoffMs(failures) {
  const maxMs = 60 * 60 * 1000;
  const baseMs = 60 * 1000;
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
}

async function fetchFeed(feedConfig) {
  const state = feedState.get(feedConfig.url) || { failures: 0, nextAllowedAt: 0 };
  const now = Date.now();
  if (now < state.nextAllowedAt) {
    return {
      items: [],
      result: {
        label: feedConfig.label,
        url: feedConfig.url,
        ok: false,
        skippedBackoff: true,
        retryAfterMs: state.nextAllowedAt - now,
        count: 0,
        durationMs: 0,
        error: "Skipped due to temporary backoff"
      }
    };
  }

  const started = Date.now();
  const result = {
    label: feedConfig.label,
    url: feedConfig.url,
    ok: false,
    skippedBackoff: false,
    retryAfterMs: 0,
    count: 0,
    durationMs: 0,
    error: null
  };

  try {
    const feed = await parser.parseURL(feedConfig.url);
    const items = (feed.items || []).map((item) => ({
      source: feedConfig.label,
      sourceUrl: feedConfig.url,
      title: item.title || "Untitled",
      link: item.link || "",
      pubDate: item.pubDate || item.isoDate || null,
      creator: item.creator || item.author || "",
      categories: item.categories || [],
      contentSnippet: item.contentSnippet || item.summary || "",
      content: item.content || item["content:encoded"] || ""
    }));

    result.ok = true;
    result.count = items.length;
    result.durationMs = Date.now() - started;
    feedState.set(feedConfig.url, { failures: 0, nextAllowedAt: 0 });

    return { items, result };
  } catch (error) {
    const failures = state.failures + 1;
    const backoffMs = getBackoffMs(failures);
    feedState.set(feedConfig.url, {
      failures,
      nextAllowedAt: Date.now() + backoffMs
    });

    result.durationMs = Date.now() - started;
    result.retryAfterMs = backoffMs;
    result.error = String(error.message || error);

    return { items: [], result };
  }
}

function dedupeArticles(articles) {
  const seen = new Set();

  return articles.filter((article) => {
    const key = `${article.title.toLowerCase()}::${article.link}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function refreshArticles(force) {
  ensureDb();

  if (!force && cache.updatedAt && dayjs().diff(cache.updatedAt, "minute") < 50) {
    return {
      updatedAt: cache.updatedAt,
      nextRefreshAt: dayjs(cache.updatedAt).add(1, "hour").toISOString(),
      articles: cache.articles,
      feedStats: cache.feedStats,
      settings: cache.settings,
      cached: true
    };
  }

  const settings = getSettings();

  const settled = await Promise.all(FEEDS.map((feed) => fetchFeed(feed)));
  const allArticles = settled.flatMap((entry) => entry.items);
  const feedStats = settled.map((entry) => entry.result);

  const analyzed = analyzeAndFilterArticles(dedupeArticles(allArticles), settings).slice(0, 120);

  cache.updatedAt = new Date().toISOString();
  cache.articles = analyzed;
  cache.feedStats = feedStats;
  cache.settings = settings;

  const payload = {
    updatedAt: cache.updatedAt,
    nextRefreshAt: dayjs(cache.updatedAt).add(1, "hour").toISOString(),
    articles: cache.articles,
    feedStats: cache.feedStats,
    settings: cache.settings,
    cached: false
  };

  saveSnapshot(payload);

  return payload;
}

async function updateTuning(partialSettings) {
  ensureDb();
  const settings = updateSettings(partialSettings);
  cache.settings = settings;
  return refreshArticles(true);
}

async function getTuning() {
  ensureDb();
  return getSettings();
}

async function getCachedArticles() {
  ensureDb();

  if (!cache.updatedAt) {
    const snapshot = getLatestSnapshot();
    if (snapshot) {
      cache.updatedAt = snapshot.updatedAt;
      cache.articles = snapshot.articles || [];
      cache.feedStats = snapshot.feedStats || [];
      cache.settings = snapshot.settings || getSettings();

      return {
        ...snapshot,
        cached: true,
        nextRefreshAt: dayjs(snapshot.updatedAt).add(1, "hour").toISOString()
      };
    }

    return refreshArticles(false);
  }

  return {
    updatedAt: cache.updatedAt,
    nextRefreshAt: dayjs(cache.updatedAt).add(1, "hour").toISOString(),
    articles: cache.articles,
    feedStats: cache.feedStats,
    settings: cache.settings || getSettings(),
    cached: true
  };
}

module.exports = {
  refreshArticles,
  getCachedArticles,
  getTuning,
  updateTuning
};
