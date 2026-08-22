const Parser = require("rss-parser");
const dayjs = require("dayjs");
const { analyzeAndFilterArticles } = require("./analyzer");
const {
  ensureDb,
  getSettings,
  getFeeds,
  getMaxTotalArticles,
  getPerFeedCap,
  getCategoryWeights,
  getCategoryMinimums,
  CATEGORY_WEIGHT_VALUES,
  saveSnapshot,
  getLatestSnapshot
} = require("./storage");
const {
  upsertArticles,
  getUnembeddedArticles,
  setEmbedding,
  pruneOldArticles
} = require("./articleStore");
const { embed, isConfigured, OLLAMA_EMBED_MODEL } = require("./embedder");
const { filterOutSemanticPromos } = require("./promoFilter");

// Retention for the articles table (embeddings are the expensive thing to
// recompute, but they're small enough that 60 days is comfortable).
const ARTICLE_RETENTION_DAYS = Math.max(
  7,
  Number(process.env.ARTICLE_RETENTION_DAYS) || 60
);

// How many un-embedded articles to try per refresh cycle. On a fresh
// install this drains the backlog gradually rather than hammering the
// desktop with hundreds of requests all at once.
const EMBED_BATCH_PER_REFRESH = Math.max(
  1,
  Number(process.env.EMBED_BATCH_PER_REFRESH) || 100
);

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
        category: feedConfig.category || "general",
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

// Applies user-configured category controls to a ranked article list:
//   1. Drop categories with weight = "off".
//   2. Multiply each article's rankScore by its category weight (less=0.5,
//      normal=1.0, more=2.0) so "More" categories outrank similarly-aged
//      "Less" ones.
//   3. Reserve the top-K items per category that has a configured minimum,
//      then fill remaining slots with the highest-ranked leftovers, until
//      total slots are filled.
function applyCategoryControls(ranked, weights, minimums, total) {
  const adjusted = ranked
    .filter((a) => {
      const w = weights[a.category] || "normal";
      return w !== "off";
    })
    .map((a) => {
      const w = weights[a.category] || "normal";
      const factor = CATEGORY_WEIGHT_VALUES[w] != null ? CATEGORY_WEIGHT_VALUES[w] : 1.0;
      return { ...a, rankScore: (a.rankScore || 0) * factor };
    })
    .sort((x, y) => (y.rankScore || 0) - (x.rankScore || 0));

  if (adjusted.length <= total) return adjusted;

  const result = [];
  const used = new Set();
  const keyOf = (a) => `${a.source}::${a.link}`;

  // Reserve minimums per category (top-ranked first).
  Object.entries(minimums).forEach(([cat, min]) => {
    if (!min) return;
    const items = adjusted.filter((a) => a.category === cat).slice(0, min);
    items.forEach((item) => {
      if (result.length >= total) return;
      const k = keyOf(item);
      if (used.has(k)) return;
      result.push(item);
      used.add(k);
    });
  });

  // Fill remaining slots from the highest-ranked unused articles.
  for (const a of adjusted) {
    if (result.length >= total) break;
    const k = keyOf(a);
    if (used.has(k)) continue;
    result.push(a);
    used.add(k);
  }

  return result;
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
  const perFeedCap = getPerFeedCap();
  const categoryWeights = getCategoryWeights();
  const categoryMinimums = getCategoryMinimums();

  const settled = await Promise.all(feeds.map((feed) => fetchFeed(feed, perFeedCap)));
  const allArticles = settled.flatMap((entry) => entry.items);
  const feedStats = settled.map((entry) => entry.result);

  // Rank with the keyword-based analyzer first (drops politics, hard
  // negatives, non-Musk vehicles, coupon-code promo, and the obvious
  // "buying guide" / "prime day deal" phrasing).
  const ranked = analyzeAndFilterArticles(dedupeArticles(allArticles), settings);

  // Persist ranked articles before embedding so the store has stable IDs.
  try {
    upsertArticles(ranked);
    pruneOldArticles(ARTICLE_RETENTION_DAYS);
  } catch (error) {
    console.error("Article store upsert failed", error);
  }

  // Drain pending embeddings synchronously (up to the batch cap) so the
  // semantic promo filter below can act on this cycle's fresh articles.
  // If Ollama is unreachable this returns quickly and the filter no-ops.
  if (isConfigured()) {
    try {
      await embedPendingBatch(EMBED_BATCH_PER_REFRESH);
    } catch (error) {
      console.error("Foreground embedding pass failed", error);
    }
  }

  // Semantic promotional filter: drop articles that look like ads / deals
  // / product-review clickbait even when the keyword filter missed them.
  let promoDroppedCount = 0;
  let survivors = ranked;
  try {
    const { kept, dropped } = await filterOutSemanticPromos(ranked);
    survivors = kept;
    promoDroppedCount = dropped.length;
    if (dropped.length > 0) {
      console.log(
        `Semantic promo filter dropped ${dropped.length} article(s):`,
        dropped
          .slice(0, 5)
          .map((a) => `${a.semanticPromoScore.toFixed(2)} "${a.title}"`)
          .join(" | ")
      );
    }
  } catch (error) {
    console.error("Semantic promo filter failed", error);
  }

  // Apply user category controls (weights + soft minimums), take top-N,
  // then re-sort by date for display.
  const tuned = applyCategoryControls(survivors, categoryWeights, categoryMinimums, maxTotalArticles);

  const analyzed = tuned.sort((a, b) => {
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
    semanticPromoDropped: promoDroppedCount,
    cached: false
  };

  saveSnapshot(payload);

  return payload;
}

async function embedPendingBatch(maxPerRun) {
  const rows = getUnembeddedArticles(maxPerRun);
  let done = 0;
  for (const row of rows) {
    const text = `${row.title || ""}\n\n${row.snippet || ""}`.trim().slice(0, 4000);
    if (!text) continue;
    const vec = await embed(text);
    if (!vec) {
      // Ollama unreachable or errored. Bail out silently; the next
      // refresh cycle will pick up where we left off.
      return { done, aborted: true };
    }
    setEmbedding(row.link, vec, OLLAMA_EMBED_MODEL);
    done += 1;
  }
  return { done, aborted: false };
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
