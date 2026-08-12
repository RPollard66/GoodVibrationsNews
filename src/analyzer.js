// Article filtering & ranking.
//
// Design (May 2026, updated Aug 2026):
//
//  1. Articles inherit their category from their source feed (set in
//     defaultFeeds.js / the feeds DB column). We do NOT keyword-classify.
//  2. We filter out a small list of clearly-unwanted content:
//       - politics
//       - hard-negative news (war / death / disaster / serious crime)
//       - non-Musk vehicle / auto-industry coverage
//       - coupon-code promo posts
//       - product reviews / buying guides / affiliate & sponsored content
//  3. Surviving articles are ranked by recency, with a fixed AI boost:
//     articles from the ai-category feeds, or that mention AI topics
//     multiple times, rank as if they were 48 hours fresher. This makes
//     them preferentially survive the max-articles trim in feedService.
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

// Promotional / affiliate / product-review content. These articles exist to
// sell things (or drive affiliate revenue) rather than inform, so we drop
// them wholesale.
const PROMOTIONAL_KEYWORDS = [
  // Product reviews
  "hands-on review", "hands on review", "our review of",
  "long-term review", "long term review", "in-depth review",
  "should you buy", "worth buying", "worth the money",
  "is it worth it", "should you upgrade", "should i buy",
  // Buying guides / listicles
  "buying guide", "buyer's guide", "buyers guide",
  "gift guide", "holiday gift guide", "best budget",
  "best cheap", "best value", "top picks",
  "best deals on", "best deals of", "best of the deals",
  // Sales / promotions
  "prime day deal", "prime day deals", "amazon prime day",
  "black friday deal", "black friday deals",
  "cyber monday deal", "cyber monday deals",
  "deal alert", "hot deal", "hottest deals",
  "biggest sale", "on sale for", "flash sale",
  "limited time offer", "shop the sale", "shop now",
  "discounted to", "marked down to",
  // Affiliate / sponsored
  "affiliate link", "affiliate links", "sponsored post",
  "sponsored content", "sponsored by",
  "in partnership with", "brought to you by",
  "paid promotion", "we may earn a commission",
  "earn a commission", "commission from purchases"
];

// AI-content keywords used to grant a rank-score boost so AI stories
// preferentially survive when feedService trims to the max-articles cap.
// Two or more hits (or an ai-category source feed) triggers the boost.
const AI_BOOST_KEYWORDS = [
  // Core AI concepts
  "artificial intelligence", "machine learning", "deep learning",
  "neural network", "neural networks",
  // LLMs and models
  "large language model", "large language models",
  "llm", "llms", "foundation model", "foundation models",
  "generative ai", "gen ai", "generative model",
  "diffusion model", "transformer model",
  // Named products / companies
  "chatgpt", "gpt-4", "gpt-5", "gpt-6",
  "openai", "anthropic", "claude ai", "anthropic claude",
  "google gemini", "gemini pro", "gemini ultra",
  "llama model", "llama 3", "llama 4", "llama 5",
  "mistral ai", "hugging face", "deepseek",
  "stable diffusion", "midjourney", "dall-e", "sora ai",
  "grok ai", "xai grok",
  // Techniques
  "reinforcement learning", "computer vision",
  "natural language processing",
  "text-to-image", "text to image",
  "text-to-video", "text to video",
  "speech recognition", "speech synthesis",
  // Adjacent
  "ai agent", "ai agents", "ai assistant", "ai chatbot",
  "ai model", "ai models", "ai research",
  "ai safety", "ai alignment", "ai regulation",
  "ai startup", "ai company", "ai training",
  "prompt engineering",
  // Toolchain
  "pytorch", "tensorflow", "jax framework"
];

// Boost equivalent to 48 hours of freshness. Enough to make an AI article
// clearly beat a similarly-recent non-AI article at the trim step, without
// letting stale AI articles outrank fresh coverage of other topics.
const AI_BOOST_MS = 48 * 60 * 60 * 1000;

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
  const isPromotional = hasAnyKeyword(normalizedAll, PROMOTIONAL_KEYWORDS);

  // Base rank is the pubDate timestamp. More recent → higher score.
  const ts = article.pubDate ? new Date(article.pubDate).getTime() : 0;
  const baseTs = Number.isFinite(ts) ? ts : 0;

  // AI boost: an ai-category feed OR two+ AI keyword hits earns a fixed
  // 48-hour freshness bump, so AI stories preferentially survive the
  // max-articles trim in feedService.
  const category = article.category || "general";
  const aiSignalHits = countKeywordHits(normalizedAll, AI_BOOST_KEYWORDS);
  const isAiArticle = category === "ai" || aiSignalHits >= 2;
  const rankScore = baseTs + (isAiArticle ? AI_BOOST_MS : 0);

  return {
    ...article,
    // Default category to "general" if the source feed didn't supply one.
    category,
    hasPolitics,
    isHardNegative,
    isNonMuskVehicle,
    hasCouponCodePromo,
    isPromotional,
    isAiArticle,
    rankScore
  };
}

function analyzeAndFilterArticles(articles, _tuningInput = DEFAULT_TUNING) {
  return articles
    .map((article) => scoreArticle(article))
    .filter((article) => !article.hasCouponCodePromo)
    .filter((article) => !article.isPromotional)
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
