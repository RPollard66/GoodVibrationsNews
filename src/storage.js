const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { DEFAULT_TUNING, normalizeTuning } = require("./analyzer");
const { DEFAULT_FEEDS } = require("./defaultFeeds");

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
      created_at TEXT NOT NULL
    );
  `);

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
      "INSERT OR IGNORE INTO feeds (label, url, created_at) VALUES (?, ?, ?)"
    );
    const seedTx = db.transaction((feeds) => {
      feeds.forEach((feed) => insertFeed.run(feed.label, feed.url, now));
    });
    seedTx(DEFAULT_FEEDS);
  }

  return db;
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
    .prepare("SELECT id, label, url, created_at AS createdAt FROM feeds ORDER BY label COLLATE NOCASE")
    .all();
}

const MAX_ITEMS_PER_FEED_KEY = "maxItemsPerFeed";
const MAX_ITEMS_PER_FEED_DEFAULT = 25;
const MAX_ITEMS_PER_FEED_MIN = 25;
const MAX_ITEMS_PER_FEED_MAX = 100;

function clampMaxItemsPerFeed(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MAX_ITEMS_PER_FEED_DEFAULT;
  return Math.max(MAX_ITEMS_PER_FEED_MIN, Math.min(MAX_ITEMS_PER_FEED_MAX, n));
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

function addFeed({ label, url }) {
  const conn = ensureDb();
  const cleanLabel = String(label || "").trim();
  const cleanUrl = String(url || "").trim();

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
      .prepare("INSERT INTO feeds (label, url, created_at) VALUES (?, ?, ?)")
      .run(cleanLabel, cleanUrl, now);
    return { id: info.lastInsertRowid, label: cleanLabel, url: cleanUrl, createdAt: now };
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

module.exports = {
  ensureDb,
  getSettings,
  getFeeds,
  addFeed,
  removeFeed,
  getMaxItemsPerFeed,
  setMaxItemsPerFeed,
  MAX_ITEMS_PER_FEED_MIN,
  MAX_ITEMS_PER_FEED_MAX,
  MAX_ITEMS_PER_FEED_DEFAULT,
  saveSnapshot,
  getLatestSnapshot
};
