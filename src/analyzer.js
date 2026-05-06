// Article filtering & ranking.
//
// New (May 2026) design: keep things simple.
//
//  1. Articles inherit their category from their source feed (set in
//     defaultFeeds.js / the feeds DB column). We do NOT keyword-classify.
//  2. We filter out a small list of clearly-unwanted content:
//       - politics
//       - hard-negative news (war / death / disaster / serious crime)
//       - non-Musk vehicle / auto-industry coverage
//       - coupon-code promo posts
//  3. Surviving articles are ranked by recency. No sentiment analysis,
//     no per-category weights, no AI multiplier. The user explicitly asked
//     for a flat playing field across categories.
//
// `tuning` is kept for back-compat with the existing settings UI/storage
// but is no longer consulted by the filter — the only tunable behaviour is
// the cap on total articles, which lives in storage.js.

const DEFAULT_TUNING = {
  aiWeight: 2.5,
  positivityWeight: 2.2,
  negativePenaltyWeight: 3,
  positivityThreshold: 0.45
};

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTuning(tuning = {}) {
  return {
    aiWeight: Math.max(0, Math.min(5, asNumber(tuning.aiWeight, DEFAULT_TUNING.aiWeight))),
    positivityWeight: Math.max(0.2, Math.min(3, asNumber(tuning.positivityWeight, DEFAULT_TUNING.positivityWeight))),
    negativePenaltyWeight: Math.max(
      0.2,
      Math.min(3, asNumber(tuning.negativePenaltyWeight, DEFAULT_TUNING.negativePenaltyWeight))
    ),
    positivityThreshold: Math.max(
      -0.5,
      Math.min(1.5, asNumber(tuning.positivityThreshold, DEFAULT_TUNING.positivityThreshold))
    )
  };
}

// ---------------------------------------------------------------------------
// Exclusion keyword lists
// ---------------------------------------------------------------------------

const POLITICS_KEYWORDS = [
  "election", "elections", "electoral", "ballot", "primary election", "caucus",
  "voter turnout", "campaign rally", "campaign trail", "presidential candidate",
  "candidate for", "incumbent", "ruling party", "opposition party",
  "coalition government", "senate", "senator", "congress", "congressional",
  "house of representatives", "parliament", "parliamentary", "lawmaker",
  "lawmakers", "legislature", "president", "vice president", "prime minister",
  "chancellor", "governor", "mayor", "cabinet member", "secretary of state",
  "attorney general", "ambassador", "democrat", "democrats", "republican",
  "republicans", "gop", "maga", "left wing", "left-wing", "right wing",
  "right-wing", "far left", "far-left", "far right", "far-right", "populist",
  "nationalist", "white house", "capitol hill", "supreme court", "scotus",
  "justice department", "department of justice", "kremlin", "european commission",
  "european parliament", "united nations", "u.n. security council", "nato summit",
  "world bank", "diplomacy", "diplomat", "diplomatic", "sanctions", "sanctioned",
  "tariff", "tariffs", "trade war", "executive order",
  "trump", "biden", "putin", "xi jinping", "netanyahu", "zelensky", "macron",
  "starmer", "modi", "erdogan", "orban", "milei"
];

const HARD_NEGATIVE_KEYWORDS = [
  // War / violence
  "war", "civil war", "invasion", "airstrike", "missile strike", "bombing",
  "bomb attack", "terrorist", "terrorism", "hostage", "kidnapping", "abduction",
  // Death / serious crime
  "killed", "dead", "death", "deaths", "fatal", "murder", "manslaughter",
  "shooting", "stabbing", "rape", "sexual assault", "mass shooting", "gun violence",
  // Disasters
  "disaster", "catastrophe", "famine", "drought", "wildfire", "hurricane",
  "tornado", "earthquake destroyed", "deadly flood", "pandemic", "outbreak",
  // Financial / scandal
  "bankruptcy", "embezzlement", "bribery", "corruption scandal", "ponzi scheme",
  "money laundering"
];

const VEHICLE_KEYWORDS = [
  "car", "cars", "sedan", "suv", "truck", "pickup truck", "minivan",
  "automobile", "automotive", "auto industry", "auto maker", "automaker",
  "automakers", "vehicle", "vehicles", "ev", "evs", "electric vehicle",
  "electric vehicles", "electric car", "electric cars", "electric suv",
  "electric truck", "electric pickup", "hybrid car", "plug-in hybrid", "phev",
  "self-driving", "self driving", "autonomous vehicle", "autonomous driving",
  "robotaxi", "robo-taxi",
  "ford", "gm", "general motors", "chevrolet", "chevy", "cadillac", "buick",
  "chrysler", "dodge", "jeep", "ram trucks", "stellantis", "toyota", "lexus",
  "honda", "acura", "nissan", "infiniti", "mazda", "subaru", "mitsubishi",
  "hyundai", "kia", "genesis motors", "volkswagen", "vw id", "audi", "porsche",
  "bmw", "mercedes-benz", "mercedes benz", "mini cooper", "volvo cars",
  "polestar", "jaguar", "land rover", "range rover", "ferrari", "lamborghini",
  "maserati", "bugatti", "bentley", "rolls-royce", "mclaren", "aston martin",
  "lotus cars", "rivian", "lucid motors", "fisker", "byd", "nio", "xpeng",
  "li auto", "zeekr", "geely", "great wall motors", "vinfast", "waymo",
  "cruise automation", "zoox"
];

// Musk-related allow-list — if any of these appear, the vehicle filter is
// bypassed so Tesla / SpaceX / xAI / Neuralink / Boring Co. / Starlink
// stories aren't caught alongside generic auto-industry news.
const MUSK_ALLOWLIST = [
  "elon musk", "musk interview",
  // Tesla
  "tesla", "model s", "model 3", "model x", "model y", "cybertruck", "cybercab",
  "cyber truck", "tesla semi", "tesla roadster", "powerwall", "megapack",
  "supercharger", "tesla bot", "optimus robot", "full self-driving",
  "full self driving", "tesla fsd",
  // SpaceX
  "spacex", "space x", "starship", "super heavy", "falcon 9", "falcon heavy",
  "dragon capsule", "crew dragon", "cargo dragon", "raptor engine", "starbase",
  // Starlink
  "starlink", "starshield",
  // xAI / Grok
  "xai", "x.ai", "grok ai", "grok chatbot", "grok model", "colossus supercomputer",
  // Neuralink / Boring Co.
  "neuralink", "boring company", "the boring company", "hyperloop"
];

const COUPON_PATTERNS = [
  /\b(coupon|promo|discount|voucher|offer|deal)\s+code\b/,
  /\bcode\s+at\s+checkout\b/,
  /\buse\s+code\b/,
  /\benter\s+code\b/,
  /\bapply\s+code\b/,
  /\bredeem\s+code\b/,
  /\bpromo\b.*\bcheckout\b/,
  /\b(save|off)\s+\d{1,3}%\b/,
  /\bfree\s+shipping\b/
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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

function normalizeForKeywordMatch(value) {
  // Surround text with spaces and reduce all non-alphanumerics to single
  // spaces so word-boundary checks ("\b" semantics) become a simple
  // includes(" word ") test against any keyword.
  return ` ${String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function countKeywordHits(normalizedText, keywords) {
  let n = 0;
  for (const kw of keywords) {
    const needle = ` ${String(kw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
    if (needle === "  ") continue;
    let idx = normalizedText.indexOf(needle);
    while (idx !== -1) {
      n += 1;
      idx = normalizedText.indexOf(needle, idx + needle.length);
    }
  }
  return n;
}

function hasAnyKeyword(normalizedText, keywords) {
  for (const kw of keywords) {
    const needle = ` ${String(kw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
    if (needle === "  ") continue;
    if (normalizedText.indexOf(needle) !== -1) return true;
  }
  return false;
}

function hasCouponContext(combinedText) {
  const lower = String(combinedText || "").toLowerCase();
  return COUPON_PATTERNS.some((re) => re.test(lower));
}

// ---------------------------------------------------------------------------
// Per-article scoring
// ---------------------------------------------------------------------------

function scoreArticle(article) {
  const titleText = cleanText(article.title);
  const bodyText = cleanText(`${article.contentSnippet || ""} ${article.content || ""}`);
  const combinedText = `${titleText} ${bodyText}`;
  const normalizedAll = normalizeForKeywordMatch(combinedText);

  const hasPolitics = hasAnyKeyword(normalizedAll, POLITICS_KEYWORDS);
  const isHardNegative = hasAnyKeyword(normalizedAll, HARD_NEGATIVE_KEYWORDS);
  const hasVehicle = hasAnyKeyword(normalizedAll, VEHICLE_KEYWORDS);
  const hasMusk = hasAnyKeyword(normalizedAll, MUSK_ALLOWLIST);
  const isNonMuskVehicle = hasVehicle && !hasMusk;
  const hasCouponCodePromo = hasCouponContext(combinedText);

  // Recency-based ranking. More recent → higher rank score. Articles with
  // no pubDate fall to the bottom.
  const ts = article.pubDate ? new Date(article.pubDate).getTime() : 0;
  const rankScore = Number.isFinite(ts) ? ts : 0;

  return {
    ...article,
    // Default category to "general" if the source feed didn't supply one.
    category: article.category || "general",
    hasPolitics,
    isHardNegative,
    isNonMuskVehicle,
    hasCouponCodePromo,
    rankScore
  };
}

function analyzeAndFilterArticles(articles, _tuningInput = DEFAULT_TUNING) {
  return articles
    .map((article) => scoreArticle(article))
    .filter((article) => !article.hasCouponCodePromo)
    .filter((article) => !article.hasPolitics)
    .filter((article) => !article.isHardNegative)
    .filter((article) => !article.isNonMuskVehicle)
    .sort((a, b) => b.rankScore - a.rankScore);
}

module.exports = {
  DEFAULT_TUNING,
  normalizeTuning,
  analyzeAndFilterArticles
};
