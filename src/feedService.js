const Parser = require("rss-parser");
const dayjs = require("dayjs");
const { analyzeAndFilterArticles } = require("./analyzer");
const {
  ensureDb,
  getSettings,
  getFeeds,
  getMaxTotalArticles,
  saveSnapshot,
  getLatestSnapshot
} = require("./storage");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "GoodVibrationsNews/1.0"
  }
});

function sanitizeFeedText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<references[\s\S]*?<\/references>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCodeText(value) {
  const text = String(value || "").toLowerCase();
  const markers = ["window.", "let ", "const ", "import ", "function ", "=>", "@article", "@misc", "class=", "href="];
  const hitCount = markers.reduce((count, marker) => count + (text.includes(marker) ? 1 : 0), 0);
  return hitCount >= 3;
}

function pickSnippet(item) {
  const candidates = [item.contentSnippet, item.summary, item.content, item["content:encoded"]];

  for (const candidate of candidates) {
    const cleaned = sanitizeFeedText(candidate);
    if (!cleaned) continue;
    if (cleaned.length < 60) continue;
    if (looksLikeCodeText(cleaned)) continue;
    return cleaned;
  }

  return "";
}

const cache = {
  updatedAt: null,
  articles: [],
  feedStats: [],
  settings: null
};

// Per-feed-URL backoff state. Entries are created lazily for whichever
// feed URLs are currently configured in the database.
const feedState = new Map();

function getFeedState(url) {
  let state = feedState.get(url);
  if (!state) {
    state = { failures: 0, nextAllowedAt: 0 };
    feedState.set(url, state);
  }
  return state;
}

function getBackoffMs(failures) {
  const maxMs = 60 * 60 * 1000;
  const baseMs = 60 * 1000;
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
}

async function fetchFeed(feedConfig, maxItemsPerFeed) {
  const state = getFeedState(feedConfig.url);
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
    const items = (feed.items || []).slice(0, maxItemsPerFeed).map((item) => {
      const cleanedContent = sanitizeFeedText(item.content || item["content:encoded"] || item.summary || "");
      const cleanedSnippet = pickSnippet(item);

      return {
        source: feedConfig.label,
        sourceUrl: feedConfig.url,
        title: item.title || "Untitled",
        link: item.link || "",
        pubDate: item.pubDate || item.isoDate || null,
        creator: item.creator || item.author || "",
        categories: item.categories || [],
        contentSnippet: cleanedSnippet || cleanedContent || "Read the full story on the source site.",
        content: cleanedContent
      };
    });

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
  const feeds = getFeeds();
  const maxTotalArticles = getMaxTotalArticles();

  const settled = await Promise.all(feeds.map((feed) => fetchFeed(feed, maxTotalArticles)));
  const allArticles = settled.flatMap((entry) => entry.items);
  const feedStats = settled.map((entry) => entry.result);

  // analyzeAndFilterArticles already sorts by rankScore desc — take the top
  // N by rank, then re-sort that subset by publication date for display.
  const analyzed = analyzeAndFilterArticles(dedupeArticles(allArticles), settings)
    .slice(0, maxTotalArticles)
    .sort((a, b) => {
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    });

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

function invalidateCache() {
  cache.updatedAt = null;
  cache.articles = [];
  cache.feedStats = [];
}

module.exports = {
  refreshArticles,
  getCachedArticles,
  invalidateCache
};
