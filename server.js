const express = require("express");
const path = require("path");
const {
  getCachedArticles,
  refreshArticles,
  getTuning,
  updateTuning
} = require("./src/feedService");
const { ensureDb } = require("./src/storage");

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";

app.use(express.json());
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

app.post("/api/refresh", async (_req, res) => {
  try {
    const payload = await refreshArticles(true);
    res.json(payload);
  } catch (error) {
    console.error("Manual refresh failed", error);
    res.status(500).json({ error: "Failed to refresh feeds." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "good-vibrations-news" });
});

app.get("/api/settings", async (_req, res) => {
  try {
    const settings = await getTuning();
    res.json(settings);
  } catch (error) {
    console.error("Failed to load settings", error);
    res.status(500).json({ error: "Failed to load settings." });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const payload = await updateTuning(req.body || {});
    res.json(payload);
  } catch (error) {
    console.error("Failed to update settings", error);
    res.status(500).json({ error: "Failed to update settings." });
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
