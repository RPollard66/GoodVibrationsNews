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

const MAX_ITEMS_PER_FEED = 25;

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

const FEEDS = [
  { label: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { label: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
  { label: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { label: "WIRED", url: "https://www.wired.com/feed/rss" },
  { label: "Phys.org", url: "https://phys.org/rss-feed/" },
  { label: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/" },
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
  { label: "Positive News", url: "https://www.positive.news/feed/" },
  // Science & Startups
  { label: "ScienceDaily All News", url: "https://www.sciencedaily.com/rss/all.xml" },
  { label: "ScienceDaily Top Science", url: "https://www.sciencedaily.com/rss/top/science.xml" },
  { label: "ScienceDaily Environment", url: "https://www.sciencedaily.com/rss/earth_climate.xml" },
  { label: "Science (AAAS)", url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science" },
  { label: "ScienceAlert", url: "https://www.sciencealert.com/rss" },
  { label: "Science News", url: "https://www.sciencenews.org/feed" },
  { label: "Nature News", url: "http://feeds.nature.com/nature/rss/current" },
  { label: "Live Science", url: "https://www.livescience.com/feeds/all" },
  { label: "Space.com", url: "https://www.space.com/feeds/all" },
  { label: "EOS (AGU)", url: "https://eos.org/feed" },
  { label: "PLOS Biology", url: "https://journals.plos.org/plosbiology/feed/atom" },
  { label: "Phys.org Physics", url: "https://phys.org/rss-feed/physics-news/" },
  { label: "Phys.org Chemistry", url: "https://phys.org/rss-feed/chemistry-news/" },
  // Android feeds
  { label: "Android Authority", url: "https://www.androidauthority.com/feed/" },
  { label: "Android Police", url: "https://www.androidpolice.com/feed/" },
  { label: "9to5Google Android", url: "https://9to5google.com/guides/android/feed/" },
  { label: "Android Central", url: "https://www.androidcentral.com/rss.xml" },
  { label: "Android Headlines", url: "https://www.androidheadlines.com/feed/" },
  { label: "Droid Life", url: "https://www.droid-life.com/feed/" },
  { label: "Phandroid", url: "https://phandroid.com/feed/" },
  { label: "Talk Android", url: "https://www.talkandroid.com/feed/" },
  { label: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { label: "Product Hunt", url: "http://www.producthunt.com/feed" },
  { label: "Hacker News", url: "http://news.ycombinator.com/rss" },
  { label: "SlashGear", url: "https://www.slashgear.com/feed" },
  // Engineering Blogs
  { label: "The Pragmatic Engineer", url: "https://blog.pragmaticengineer.com/rss/" },
  { label: "Stripe Blog", url: "https://stripe.com/blog/feed.rss" },
  { label: "Science Magazine News", url: "https://www.science.org/rss/news_current.xml" },
  { label: "NASA Breaking News", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss" },
  { label: "GitHub Engineering", url: "http://githubengineering.com/atom.xml" },
  { label: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/" },
  { label: "Dropbox Tech", url: "https://dropbox.tech/feed" },
  { label: "Slack Engineering", url: "https://slack.engineering/feed" },
  { label: "Spotify Engineering", url: "https://engineering.atspotify.com/feed/" },
  // Machine Learning & AI
  { label: "DeepMind", url: "https://deepmind.com/blog/feed/basic/" },
  { label: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { label: "Google AI Blog", url: "http://googleresearch.blogspot.com/atom.xml" },
  { label: "Towards Data Science", url: "https://towardsdatascience.com/feed" },
  { label: "PyTorch", url: "https://pytorch.org/feed" },
  { label: "MIT Research News", url: "https://news.mit.edu/rss/research" },
  { label: "Jay Alammar", url: "https://jalammar.github.io/feed.xml" },
  { label: "ML@CMU", url: "https://blog.ml.cmu.edu/feed/" },
  // Raspberry Pi & Maker-specific feeds
  { label: "Raspberry Pi Blog", url: "https://www.raspberrypi.org/blog/feed/" },
  { label: "Raspberry Pi News", url: "https://www.raspberrypi.com/news/feed/" },
  { label: "Jeff Geerling Blog", url: "https://www.jeffgeerling.com/blog.xml" },
  { label: "The Pi Hut", url: "https://thepihut.com/blogs/raspberry-pi-roundup.atom" },
  { label: "Hackaday Raspberry Pi", url: "https://hackaday.com/category/raspberry-pi-2/feed/" },
  { label: "pi3g.com Blog", url: "https://pi3g.com/feed/" },
  { label: "Pi My Life Up", url: "https://pimylifeup.com/category/projects/feed/" },
  { label: "RaspberryTips", url: "https://raspberrytips.com/feed/" },
  { label: "Alex Ellis' Blog", url: "https://blog.alexellis.io/rss/" },
  { label: "peppe8o", url: "https://peppe8o.com/feed/" },
  { label: "Stephen Smith Raspberry Pi", url: "https://smist08.wordpress.com/tag/raspberry-pi/feed/" },
  { label: "Raspberry Pi Spy", url: "https://www.raspberrypi-spy.co.uk/feed/" },
  { label: "Pimoroni", url: "https://blog.pimoroni.com/rss/" },
  { label: "Raspberry PiPod Blog", url: "https://www.recantha.co.uk/blog/?feed=rss2" },
  { label: "Circuit Specialists Raspberry Pi", url: "https://www.circuitspecialists.com/blog/category/single-board-computers/raspberry-pi/feed/" },
  { label: "SwitchDoc Labs", url: "https://www.switchdoc.com/category/raspberrypicat/feed/" },
  { label: "Ozzmaker", url: "https://ozzmaker.com/category/raspberry-pi/feed/" },
  { label: "PiCockpit", url: "https://picockpit.com/raspberry-pi/feed/" },
  { label: "Cat Lamin", url: "https://catlamin.com/category/education/raspberry-pi/feed/" },
  { label: "Embedded Lab", url: "https://embedded-lab.com/blog/category/raspberry-pie/feed/" },
  { label: "The Rantings of a Madman", url: "https://feeds.feedburner.com/TheRantingsAndRavingsOfAMadman" },
  { label: "FactoryForward", url: "https://www.factoryforward.com/category/raspberry-pi/feed/" },
  { label: "Raspberry Pi Tutorials", url: "https://www.raspberrypi.com/tutorials/feed/" },
  { label: "OpenSource.com Raspberry Pi", url: "https://opensource.com/taxonomy/term/7974/feed?intcmp=701f2000000h4RcAAI&src=raspberry_pi_resource_menu4" }
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
    const items = (feed.items || []).slice(0, MAX_ITEMS_PER_FEED).map((item) => {
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
