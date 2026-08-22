// Semantic promotional-content filter.
//
// The keyword-based promotional filter in analyzer.js catches obvious
// "hands-on review" / "prime day deal" / "coupon code" phrasing, but a
// lot of ad-shaped articles slip through when they use language the
// keyword list doesn't anticipate ("this smart speaker is on sale for the
// lowest price yet", "top picks for early back-to-school", etc.).
//
// This module compares each article's stored embedding against a small
// set of reference vectors that describe the *shape* of promotional
// content. If the article is too close (cosine similarity above the
// configured threshold) to any of them, we drop it.
//
// Configurable via env:
//   PROMO_FILTER_ENABLED     "true" / "false"           (default: true)
//   PROMO_FILTER_THRESHOLD   cosine similarity, 0..1    (default: 0.62)
//
// The default was tuned empirically against ~1500 articles from the
// current feed set: at 0.62 the filter drops "Today's Best Deals",
// "Product Pick of the Week", explicit sponsor posts, and buying guides
// while leaving genuine news (e.g. "Peacock raising streaming prices")
// intact. Raise it to be more permissive (fewer drops), lower to be more
// aggressive.
//
// The reference vectors are computed once at first use and cached in
// memory. If Ollama is unreachable they simply never initialise and the
// filter degrades to a no-op, so nothing regresses.

const { embed, isConfigured } = require("./embedder");
const { getEmbeddedArticles } = require("./articleStore");

const PROMO_FILTER_ENABLED =
  String(process.env.PROMO_FILTER_ENABLED || "true").toLowerCase() !== "false";

const PROMO_FILTER_THRESHOLD = (() => {
  const raw = Number(process.env.PROMO_FILTER_THRESHOLD);
  if (!Number.isFinite(raw)) return 0.62;
  return Math.max(0, Math.min(1, raw));
})();

// One prompt per "shape" of promo content. Multiple short reference
// vectors work better than one long one — an article only needs to be
// close to *any* of them to be dropped, which catches wider phrasing.
const PROMO_REFERENCE_PROMPTS = [
  "product review, hands-on evaluation, unboxing, hardware roundup, best-of list, gift guide, buying guide",
  "sale, deal, discount, coupon code, promo code, limited time offer, prime day, black friday, cyber monday, lowest price",
  "sponsored post, affiliate link, promotional partnership, brand collaboration, paid content, we earn commission"
];

let promoReferenceVectors = null;
let promoReferenceInitPromise = null;

async function initPromoReference() {
  if (promoReferenceVectors) return promoReferenceVectors;
  if (!PROMO_FILTER_ENABLED || !isConfigured()) return null;

  if (promoReferenceInitPromise) return promoReferenceInitPromise;

  promoReferenceInitPromise = (async () => {
    const vecs = [];
    for (const prompt of PROMO_REFERENCE_PROMPTS) {
      const v = await embed(prompt);
      if (v) vecs.push(v);
    }
    promoReferenceVectors = vecs.length > 0 ? vecs : null;
    promoReferenceInitPromise = null;
    return promoReferenceVectors;
  })();

  return promoReferenceInitPromise;
}

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

function maxCosine(vec, refs) {
  let best = -1;
  for (const r of refs) {
    const s = cosine(vec, r);
    if (s > best) best = s;
  }
  return best;
}

// Split articles into { kept, dropped } based on similarity to the promo
// reference set. Articles that are not yet embedded are always kept —
// they'll be evaluated on a subsequent refresh once their vector lands.
async function filterOutSemanticPromos(articles) {
  if (!PROMO_FILTER_ENABLED) return { kept: articles, dropped: [] };

  const refs = await initPromoReference();
  if (!refs || refs.length === 0) return { kept: articles, dropped: [] };

  // Build a link → vector map once so we don't rescan the DB per article.
  const embeddedByLink = new Map();
  for (const row of getEmbeddedArticles()) {
    if (row.vector) embeddedByLink.set(row.link, row.vector);
  }

  const kept = [];
  const dropped = [];
  for (const article of articles) {
    const vec = embeddedByLink.get(article.link);
    if (!vec) {
      kept.push(article);
      continue;
    }
    const score = maxCosine(vec, refs);
    if (score >= PROMO_FILTER_THRESHOLD) {
      dropped.push({ ...article, semanticPromoScore: score });
    } else {
      kept.push(article);
    }
  }
  return { kept, dropped };
}

module.exports = {
  filterOutSemanticPromos,
  initPromoReference,
  PROMO_FILTER_THRESHOLD,
  PROMO_FILTER_ENABLED
};
