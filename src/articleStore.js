// Per-article persistence and embedding storage.
//
// Sits alongside storage.js (which owns the schema, settings, feeds and
// snapshots) and exposes CRUD for the `articles` table only. We keep this
// module focused so storage.js can stay boring.
//
// Articles are keyed by their canonical `link`. Each row records when it
// was first seen and when it was last seen; the last_seen_at value drives
// retention pruning so stale articles are cleaned up automatically.
//
// Embeddings are stored as SQLite BLOB (raw Float32 bytes) alongside the
// model name they came from, so a future model swap can be handled by
// re-embedding rows where embed_model != current.

const { ensureDb } = require("./storage");
const { floatsToBlob, blobToFloats } = require("./embedder");

function upsertArticle(article) {
  const conn = ensureDb();
  const now = new Date().toISOString();
  const link = String(article.link || "").trim();
  if (!link) return;

  conn
    .prepare(
      `INSERT INTO articles
         (link, source, source_url, category, title, snippet, pub_date,
          first_seen_at, last_seen_at)
       VALUES (@link, @source, @source_url, @category, @title, @snippet,
               @pub_date, @now, @now)
       ON CONFLICT(link) DO UPDATE SET
         source = excluded.source,
         source_url = excluded.source_url,
         category = excluded.category,
         title = excluded.title,
         snippet = excluded.snippet,
         pub_date = COALESCE(articles.pub_date, excluded.pub_date),
         last_seen_at = excluded.last_seen_at`
    )
    .run({
      link,
      source: String(article.source || "").trim() || "Unknown",
      source_url: article.sourceUrl || null,
      category: article.category || "general",
      title: String(article.title || "").trim() || "Untitled",
      snippet: String(article.contentSnippet || "").trim() || null,
      pub_date: article.pubDate || null,
      now
    });
}

function upsertArticles(articles) {
  const conn = ensureDb();
  const rows = (articles || []).filter((a) => a && a.link);
  if (rows.length === 0) return 0;
  const tx = conn.transaction((batch) => batch.forEach(upsertArticle));
  tx(rows);
  return rows.length;
}

// Return oldest-first so on a fresh install we backfill embeddings for the
// most recent snapshot first (the ones the user is most likely to search).
function getUnembeddedArticles(limit = 100) {
  const conn = ensureDb();
  return conn
    .prepare(
      `SELECT link, title, snippet
         FROM articles
        WHERE embedding IS NULL
        ORDER BY last_seen_at DESC
        LIMIT ?`
    )
    .all(limit);
}

function setEmbedding(link, floatArray, model) {
  if (!floatArray) return;
  const conn = ensureDb();
  const blob = floatsToBlob(floatArray);
  conn
    .prepare(
      `UPDATE articles
          SET embedding = ?, embedded_at = ?, embed_model = ?
        WHERE link = ?`
    )
    .run(blob, new Date().toISOString(), model, link);
}

function getEmbeddedArticles() {
  const conn = ensureDb();
  return conn
    .prepare(
      `SELECT link, source, category, title, snippet,
              pub_date AS pubDate, embedding
         FROM articles
        WHERE embedding IS NOT NULL`
    )
    .all()
    .map((row) => ({
      ...row,
      vector: blobToFloats(row.embedding),
      embedding: undefined
    }));
}

function keywordSearch(query, limit = 30) {
  const conn = ensureDb();
  const like = `%${String(query || "").trim().toLowerCase()}%`;
  return conn
    .prepare(
      `SELECT link, source, category, title, snippet,
              pub_date AS pubDate
         FROM articles
        WHERE lower(title) LIKE ? OR lower(snippet) LIKE ?
        ORDER BY COALESCE(pub_date, last_seen_at) DESC
        LIMIT ?`
    )
    .all(like, like, limit);
}

function pruneOldArticles(days = 60) {
  const conn = ensureDb();
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const info = conn
    .prepare("DELETE FROM articles WHERE last_seen_at < ?")
    .run(cutoff);
  return info.changes;
}

function getArticleStats() {
  const conn = ensureDb();
  const total = conn.prepare("SELECT COUNT(*) AS n FROM articles").get().n;
  const embedded = conn
    .prepare("SELECT COUNT(*) AS n FROM articles WHERE embedding IS NOT NULL")
    .get().n;
  return { total, embedded };
}

module.exports = {
  upsertArticles,
  getUnembeddedArticles,
  setEmbedding,
  getEmbeddedArticles,
  keywordSearch,
  pruneOldArticles,
  getArticleStats
};
