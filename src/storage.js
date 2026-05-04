const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { DEFAULT_TUNING, normalizeTuning } = require("./analyzer");

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
  `);

  const upsert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)"
  );
  const now = new Date().toISOString();

  Object.entries(DEFAULT_TUNING).forEach(([key, value]) => {
    upsert.run(key, String(value), now);
  });

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
  saveSnapshot,
  getLatestSnapshot
};
