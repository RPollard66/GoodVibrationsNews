const express = require("express");
const path = require("path");
const { getCachedArticles, refreshArticles, invalidateCache } = require("./src/feedService");
const { ensureDb, getFeeds, addFeed, removeFeed, getMaxItemsPerFeed, setMaxItemsPerFeed, MAX_ITEMS_PER_FEED_MIN, MAX_ITEMS_PER_FEED_MAX, getMaxTotalArticles, setMaxTotalArticles, MAX_TOTAL_ARTICLES_MIN, MAX_TOTAL_ARTICLES_MAX } = require("./src/storage");

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";

app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/articles", async (_req, res) => {
  try {
    const payload = await getCachedArticles();
    res.json(payload);
  } catch (error) {
    console.error("Failed to get articles", error);
    res.status(500).json({ error: "Failed to fetch and analyze feeds." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "good-vibrations-news" });
});

app.get("/api/feeds", (_req, res) => {
  try {
    res.json({
      feeds: getFeeds(),
      maxItemsPerFeed: getMaxItemsPerFeed(),
      maxItemsPerFeedRange: { min: MAX_ITEMS_PER_FEED_MIN, max: MAX_ITEMS_PER_FEED_MAX },
      maxTotalArticles: getMaxTotalArticles(),
      maxTotalArticlesRange: { min: MAX_TOTAL_ARTICLES_MIN, max: MAX_TOTAL_ARTICLES_MAX }
    });
  } catch (error) {
    console.error("Failed to list feeds", error);
    res.status(500).json({ error: "Failed to list feeds." });
  }
});

app.post("/api/feeds", (req, res) => {
  const { label, url } = req.body || {};
  try {
    const feed = addFeed({ label, url });
    invalidateCache();
    refreshArticles(true).catch((error) => {
      console.error("Refresh after add-feed failed", error);
    });
    res.status(201).json({ feed });
  } catch (error) {
    if (error.code === "INVALID_LABEL" || error.code === "INVALID_URL" || error.code === "DUPLICATE_URL") {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    console.error("Failed to add feed", error);
    res.status(500).json({ error: "Failed to add feed." });
  }
});

app.delete("/api/feeds/:id", (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid feed id" });
  }
  try {
    const removed = removeFeed(id);
    if (!removed) return res.status(404).json({ error: "Feed not found" });
    invalidateCache();
    refreshArticles(true).catch((error) => {
      console.error("Refresh after remove-feed failed", error);
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove feed", error);
    res.status(500).json({ error: "Failed to remove feed." });
  }
});

app.post("/api/settings/max-items", (req, res) => {
  const { value } = req.body || {};
  const n = Number(value);
  if (!Number.isFinite(n) || n < MAX_ITEMS_PER_FEED_MIN || n > MAX_ITEMS_PER_FEED_MAX) {
    return res.status(400).json({
      error: `value must be a number between ${MAX_ITEMS_PER_FEED_MIN} and ${MAX_ITEMS_PER_FEED_MAX}`
    });
  }
  try {
    const saved = setMaxItemsPerFeed(n);
    invalidateCache();
    refreshArticles(true).catch((error) => {
      console.error("Refresh after max-items change failed", error);
    });
    res.json({ maxItemsPerFeed: saved });
  } catch (error) {
    console.error("Failed to update max items", error);
    res.status(500).json({ error: "Failed to update setting." });
  }
});

app.post("/api/settings/max-total-articles", (req, res) => {
  const { value } = req.body || {};
  const n = Number(value);
  if (!Number.isFinite(n) || n < MAX_TOTAL_ARTICLES_MIN || n > MAX_TOTAL_ARTICLES_MAX) {
    return res.status(400).json({
      error: `value must be a number between ${MAX_TOTAL_ARTICLES_MIN} and ${MAX_TOTAL_ARTICLES_MAX}`
    });
  }
  try {
    const saved = setMaxTotalArticles(n);
    invalidateCache();
    refreshArticles(true).catch((error) => {
      console.error("Refresh after max-total-articles change failed", error);
    });
    res.json({ maxTotalArticles: saved });
  } catch (error) {
    console.error("Failed to update max total articles", error);
    res.status(500).json({ error: "Failed to update setting." });
  }
});

app.post("/api/refresh", async (_req, res) => {
  try {
    invalidateCache();
    const payload = await refreshArticles(true);
    res.json(payload);
  } catch (error) {
    console.error("Manual refresh failed", error);
    res.status(500).json({ error: "Refresh failed." });
  }
});

ensureDb();

refreshArticles(false).catch((error) => {
  console.error("Initial warmup fetch failed", error);
});

const ONE_HOUR_MS = 60 * 60 * 1000;
setInterval(() => {
  refreshArticles(false).catch((error) => {
    console.error("Scheduled refresh failed", error);
  });
}, ONE_HOUR_MS);

app.listen(port, host, () => {
  console.log(`Good Vibrations News listening at http://${host}:${port}`);
});
