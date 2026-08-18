const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { DEFAULT_TUNING, normalizeTuning } = require("./analyzer");
const {
  DEFAULT_FEEDS,
  FEED_CATEGORIES,
  DEFAULT_FEED_CATEGORY
} = require("./defaultFeeds");

function normalizeCategory(value) {
  const v = String(value || "").trim().toLowerCase();
  return FEED_CATEGORIES.includes(v) ? v : DEFAULT_FEED_CATEGORY;
}

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "good-vibrations.db");

let db;

function ensureDb() {
  if (db) return db;

  fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '${DEFAULT_FEED_CATEGORY}'
    );

    CREATE TABLE IF NOT EXISTS articles (
      link TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_url TEXT,
      category TEXT NOT NULL DEFAULT '${DEFAULT_FEED_CATEGORY}',
      title TEXT NOT NULL,
      snippet TEXT,
      pub_date TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      embedding BLOB,
      embedded_at TEXT,
      embed_model TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_articles_last_seen ON articles(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_articles_embedded_at ON articles(embedded_at);
  `);

  // Migration: add category column to pre-existing feeds tables.
  const feedColumns = db.prepare("PRAGMA table_info(feeds)").all();
  if (!feedColumns.some((c) => c.name === "category")) {
    db.exec(
      `ALTER TABLE feeds ADD COLUMN category TEXT NOT NULL DEFAULT '${DEFAULT_FEED_CATEGORY}'`
    );
  }

  const upsert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)"
  );
  const now = new Date().toISOString();

  Object.entries(DEFAULT_TUNING).forEach(([key, value]) => {
    upsert.run(key, String(value), now);
  });

  // Seed default feeds on first run only (when feeds table is empty).
  const feedCount = db.prepare("SELECT COUNT(*) AS n FROM feeds").get().n;
  if (feedCount === 0) {
    const insertFeed = db.prepare(
      "INSERT OR IGNORE INTO feeds (label, url, created_at, category) VALUES (?, ?, ?, ?)"
    );
    const seedTx = db.transaction((feeds) => {
      feeds.forEach((feed) =>
        insertFeed.run(feed.label, feed.url, now, normalizeCategory(feed.category))
      );
    });
    seedTx(DEFAULT_FEEDS);
  } else {
    // For existing DBs, backfill known feeds' categories from defaults so
    // returning users get the new categorisation without losing custom feeds.
    const updateCategory = db.prepare(
      "UPDATE feeds SET category = ? WHERE url = ? AND (category IS NULL OR category = '' OR category = ?)"
    );
    const backfill = db.transaction((feeds) => {
      feeds.forEach((feed) =>
        updateCategory.run(normalizeCategory(feed.category), feed.url, DEFAULT_FEED_CATEGORY)
      );
    });
    backfill(DEFAULT_FEEDS);
  }

  // One-time migrations that seed new default feeds into already-populated
  // databases. Each migration id runs at most once per DB. Guarded on a
  // settings row so re-adding via UI, then deleting, is not undone.
  runOneTimeMigrations(db, upsert, now);

  return db;
}

// Feed sources introduced after the initial seed. Keyed by a migration id so
// we can add more waves in the future without re-inserting earlier ones.
const FEED_MIGRATIONS = [
  {
    id: "2025-08-apple-ios-seed",
    urls: [
      "https://www.apple.com/newsroom/rss-feed.rss",
      "https://developer.apple.com/news/rss/news.rss",
      "https://machinelearning.apple.com/rss.xml",
      "https://www.swift.org/atom.xml",
      "https://daringfireball.net/feeds/main",
      "https://sixcolors.com/feed/",
      "https://mjtsai.com/blog/feed/",
      "https://eclecticlight.co/feed/",
      "https://panic.com/blog/feed/",
      "https://iosdevweekly.com/issues.rss"
    ]
  }
];

function runOneTimeMigrations(db, upsert, now) {
  const insertFeed = db.prepare(
    "INSERT OR IGNORE INTO feeds (label, url, created_at, category) VALUES (?, ?, ?, ?)"
  );
  const feedByUrl = new Map(DEFAULT_FEEDS.map((f) => [f.url, f]));

  for (const migration of FEED_MIGRATIONS) {
    const key = `feedMigration.${migration.id}`;
    const existing = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (existing) continue;

    const tx = db.transaction(() => {
      for (const url of migration.urls) {
        const feed = feedByUrl.get(url);
        if (!feed) continue;
        insertFeed.run(feed.label, feed.url, now, normalizeCategory(feed.category));
      }
      upsert.run(key, now, now);
    });
    tx();
  }
}

function getSettings() {
  const conn = ensureDb();
  const rows = conn.prepare("SELECT key, value FROM settings").all();
  const current = rows.reduce((acc, row) => {
    acc[row.key] = Number(row.value);
    return acc;
  }, {});

  return normalizeTuning({ ...DEFAULT_TUNING, ...current });
}

function getFeeds() {
  const conn = ensureDb();
  return conn
    .prepare(
      "SELECT id, label, url, category, created_at AS createdAt FROM feeds ORDER BY label COLLATE NOCASE"
    )
    .all();
}

const MAX_ITEMS_PER_FEED_KEY = "maxItemsPerFeed";
const MAX_ITEMS_PER_FEED_DEFAULT = 25;
const MAX_ITEMS_PER_FEED_MIN = 25;
const MAX_ITEMS_PER_FEED_MAX = 100;

const MAX_TOTAL_ARTICLES_KEY = "maxTotalArticles";
const MAX_TOTAL_ARTICLES_DEFAULT = 75;
const MAX_TOTAL_ARTICLES_MIN = 25;
const MAX_TOTAL_ARTICLES_MAX = 120;

const PER_FEED_CAP_KEY = "perFeedCap";
const PER_FEED_CAP_DEFAULT = 8;
const PER_FEED_CAP_MIN = 3;
const PER_FEED_CAP_MAX = 15;

const CATEGORY_WEIGHTS_KEY = "categoryWeights";
const CATEGORY_MINIMUMS_KEY = "categoryMinimums";
const CATEGORY_WEIGHT_VALUES = { off: 0, less: 0.5, normal: 1.0, more: 2.0 };
const CATEGORY_WEIGHT_DEFAULT = "normal";
const CATEGORY_MINIMUM_MAX = 5;

function clampMaxItemsPerFeed(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MAX_ITEMS_PER_FEED_DEFAULT;
  return Math.max(MAX_ITEMS_PER_FEED_MIN, Math.min(MAX_ITEMS_PER_FEED_MAX, n));
}

function clampMaxTotalArticles(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MAX_TOTAL_ARTICLES_DEFAULT;
  return Math.max(MAX_TOTAL_ARTICLES_MIN, Math.min(MAX_TOTAL_ARTICLES_MAX, n));
}

function getMaxItemsPerFeed() {
  const conn = ensureDb();
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(MAX_ITEMS_PER_FEED_KEY);
  if (!row) return MAX_ITEMS_PER_FEED_DEFAULT;
  return clampMaxItemsPerFeed(row.value);
}

function setMaxItemsPerFeed(value) {
  const conn = ensureDb();
  const clamped = clampMaxItemsPerFeed(value);
  const now = new Date().toISOString();
  conn
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(MAX_ITEMS_PER_FEED_KEY, String(clamped), now);
  return clamped;
}

function getMaxTotalArticles() {
  const conn = ensureDb();
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(MAX_TOTAL_ARTICLES_KEY);
  if (!row) return MAX_TOTAL_ARTICLES_DEFAULT;
  return clampMaxTotalArticles(row.value);
}

function setMaxTotalArticles(value) {
  const conn = ensureDb();
  const clamped = clampMaxTotalArticles(value);
  const now = new Date().toISOString();
  conn
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(MAX_TOTAL_ARTICLES_KEY, String(clamped), now);
  return clamped;
}

function clampPerFeedCap(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return PER_FEED_CAP_DEFAULT;
  return Math.max(PER_FEED_CAP_MIN, Math.min(PER_FEED_CAP_MAX, n));
}

function getPerFeedCap() {
  const conn = ensureDb();
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(PER_FEED_CAP_KEY);
  if (!row) return PER_FEED_CAP_DEFAULT;
  return clampPerFeedCap(row.value);
}

function setPerFeedCap(value) {
  const conn = ensureDb();
  const clamped = clampPerFeedCap(value);
  const now = new Date().toISOString();
  conn
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(PER_FEED_CAP_KEY, String(clamped), now);
  return clamped;
}

function normalizeCategoryWeights(input) {
  const out = {};
  const allowed = new Set(Object.keys(CATEGORY_WEIGHT_VALUES));
  FEED_CATEGORIES.forEach((cat) => {
    const raw = input && typeof input === "object" ? String(input[cat] || "").toLowerCase() : "";
    out[cat] = allowed.has(raw) ? raw : CATEGORY_WEIGHT_DEFAULT;
  });
  return out;
}

function getCategoryWeights() {
  const conn = ensureDb();
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(CATEGORY_WEIGHTS_KEY);
  let parsed = null;
  if (row) {
    try { parsed = JSON.parse(row.value); } catch (_) { parsed = null; }
  }
  return normalizeCategoryWeights(parsed);
}

function setCategoryWeights(input) {
  const conn = ensureDb();
  const normalized = normalizeCategoryWeights(input);
  const now = new Date().toISOString();
  conn
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(CATEGORY_WEIGHTS_KEY, JSON.stringify(normalized), now);
  return normalized;
}

function normalizeCategoryMinimums(input) {
  const out = {};
  FEED_CATEGORIES.forEach((cat) => {
    const raw = input && typeof input === "object" ? Number(input[cat]) : 0;
    const n = Number.isFinite(raw) ? Math.round(raw) : 0;
    out[cat] = Math.max(0, Math.min(CATEGORY_MINIMUM_MAX, n));
  });
  return out;
}

function getCategoryMinimums() {
  const conn = ensureDb();
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(CATEGORY_MINIMUMS_KEY);
  let parsed = null;
  if (row) {
    try { parsed = JSON.parse(row.value); } catch (_) { parsed = null; }
  }
  return normalizeCategoryMinimums(parsed);
}

function setCategoryMinimums(input) {
  const conn = ensureDb();
  const normalized = normalizeCategoryMinimums(input);
  const now = new Date().toISOString();
  conn
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .run(CATEGORY_MINIMUMS_KEY, JSON.stringify(normalized), now);
  return normalized;
}

function addFeed({ label, url, category }) {
  const conn = ensureDb();
  const cleanLabel = String(label || "").trim();
  const cleanUrl = String(url || "").trim();
  const cleanCategory = normalizeCategory(category);

  if (!cleanLabel) {
    const err = new Error("Label is required");
    err.code = "INVALID_LABEL";
    throw err;
  }
  if (!/^https?:\/\/\S+$/i.test(cleanUrl)) {
    const err = new Error("URL must be a valid http(s) URL");
    err.code = "INVALID_URL";
    throw err;
  }

  const now = new Date().toISOString();
  try {
    const info = conn
      .prepare("INSERT INTO feeds (label, url, created_at, category) VALUES (?, ?, ?, ?)")
      .run(cleanLabel, cleanUrl, now, cleanCategory);
    return {
      id: info.lastInsertRowid,
      label: cleanLabel,
      url: cleanUrl,
      category: cleanCategory,
      createdAt: now
    };
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      const err = new Error("A feed with that URL already exists");
      err.code = "DUPLICATE_URL";
      throw err;
    }
    throw error;
  }
}

function removeFeed(id) {
  const conn = ensureDb();
  const info = conn.prepare("DELETE FROM feeds WHERE id = ?").run(id);
  return info.changes > 0;
}

function saveSnapshot(payload) {
  const conn = ensureDb();
  conn
    .prepare("INSERT INTO snapshots (updated_at, payload) VALUES (?, ?)")
    .run(payload.updatedAt, JSON.stringify(payload));

  const retain = Math.max(1, parseInt(process.env.SNAPSHOT_RETAIN || "5", 10));
  conn
    .prepare(
      "DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT ?)"
    )
    .run(retain);
}

function getLatestSnapshot() {
  const conn = ensureDb();
  const row = conn
    .prepare("SELECT payload FROM snapshots ORDER BY id DESC LIMIT 1")
    .get();

  if (!row) return null;

  try {
    return JSON.parse(row.payload);
  } catch (error) {
    return null;
  }
}

function setFeedCategory(id, category) {
  const conn = ensureDb();
  const cleanCategory = normalizeCategory(category);
  const info = conn
    .prepare("UPDATE feeds SET category = ? WHERE id = ?")
    .run(cleanCategory, id);
  return info.changes > 0 ? cleanCategory : null;
}

module.exports = {
  ensureDb,
  getSettings,
  getFeeds,
  addFeed,
  removeFeed,
  setFeedCategory,
  FEED_CATEGORIES,
  DEFAULT_FEED_CATEGORY,
  getMaxItemsPerFeed,
  setMaxItemsPerFeed,
  getMaxTotalArticles,
  setMaxTotalArticles,
  getPerFeedCap,
  setPerFeedCap,
  getCategoryWeights,
  setCategoryWeights,
  getCategoryMinimums,
  setCategoryMinimums,
  CATEGORY_WEIGHT_VALUES,
  CATEGORY_WEIGHT_DEFAULT,
  CATEGORY_MINIMUM_MAX,
  PER_FEED_CAP_MIN,
  PER_FEED_CAP_MAX,
  PER_FEED_CAP_DEFAULT,
  MAX_ITEMS_PER_FEED_MIN,
  MAX_ITEMS_PER_FEED_MAX,
  MAX_ITEMS_PER_FEED_DEFAULT,
  MAX_TOTAL_ARTICLES_MIN,
  MAX_TOTAL_ARTICLES_MAX,
  MAX_TOTAL_ARTICLES_DEFAULT,
  saveSnapshot,
  getLatestSnapshot
};
