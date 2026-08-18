// Semantic + keyword search over stored articles.
//
// Behaviour:
//   1. Empty query   → return no results.
//   2. Ollama up     → embed the query, cosine-rank against all articles
//                      that already have stored embeddings, return top N.
//   3. Ollama down / no embedded articles / no configured URL
//                    → fall back to a plain substring search over
//                      title + snippet, ordered by publish date.
//
// The mode is included in the response so the UI can tell the user
// whether they're looking at semantic or keyword results.

const { embed, isConfigured } = require("./embedder");
const { getEmbeddedArticles, keywordSearch } = require("./articleStore");

function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

async function semanticSearch(query, limit) {
  if (!isConfigured()) return null;
  const vec = await embed(query);
  if (!vec) return null;

  const rows = getEmbeddedArticles();
  if (rows.length === 0) return null;

  const scored = [];
  for (const row of rows) {
    if (!row.vector) continue;
    const score = cosine(vec, row.vector);
    scored.push({
      link: row.link,
      source: row.source,
      category: row.category,
      title: row.title,
      snippet: row.snippet,
      pubDate: row.pubDate,
      score
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

async function searchArticles(query, limit = 30) {
  const q = String(query || "").trim();
  if (!q) return { mode: "empty", results: [] };

  const cap = Math.max(1, Math.min(50, Number(limit) || 30));

  const sem = await semanticSearch(q, cap);
  if (sem && sem.length > 0) {
    return { mode: "semantic", results: sem };
  }

  const kw = keywordSearch(q, cap).map((row) => ({ ...row, score: null }));
  return { mode: "keyword", results: kw };
}

module.exports = { searchArticles };
