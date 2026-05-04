const Sentiment = require("sentiment");

const sentiment = new Sentiment();

const DEFAULT_TUNING = {
  aiWeight: 2.5,
  positivityWeight: 2.2,
  negativePenaltyWeight: 3,
  positivityThreshold: 0.45
};

const AI_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "generative ai",
  "genai",
  "stable diffusion",
  "diffusion model",
  "image generation",
  "llm",
  "large language model",
  "openai",
  "anthropic",
  "deepmind",
  "nvidia",
  "copilot",
  "chatgpt"
];

const ANDROID_KEYWORDS = [
  "android",
  "android 14",
  "android 15",
  "android 16",
  "google play",
  "play store",
  "apk",
  "aosp",
  "one ui",
  "wear os",
  "android auto",
  "samsung galaxy",
  "google pixel"
];

const SCIENCE_KEYWORDS = [
  "science",
  "research",
  "scientist",
  "scientists",
  "physics",
  "chemistry",
  "biology",
  "biotech",
  "neuroscience",
  "astronomy",
  "space",
  "planet",
  "climate",
  "earth",
  "geology",
  "environment",
  "laboratory",
  "peer reviewed",
  "software",
  "hardware",
  "tech",
  "developer",
  "coding",
  "startup",
  "chip",
  "cloud",
  "cybersecurity",
  "robot",
  "app",
  "gadget",
  "raspberry pi",
  "arduino",
  "meshtastic",
  "flipper zero",
  "maker",
  "electronics",
  "embedded",
  "microcontroller",
  "pcb",
  "lora",
  "ham radio",
  "firmware",
  "iot",
  "solder",
  "sdr",
  "fpga",
  "mathematics",
  "math"
];

const MAKER_KEYWORDS = [
  "raspberry pi",
  "arduino",
  "meshtastic",
  "flipper zero",
  "maker",
  "hobby electronics",
  "electronics",
  "embedded",
  "microcontroller",
  "pcb",
  "lora",
  "ham radio",
  "firmware",
  "iot",
  "solder",
  "sdr",
  "fpga"
];

const GAMING_KEYWORDS = [
  "video game",
  "gaming",
  "xbox",
  "playstation",
  "nintendo",
  "steam",
  "esports",
  "indie game",
  "rpg",
  "fps",
  "game awards"
];

const POSITIVE_KEYWORDS = [
  "breakthrough",
  "wins",
  "win",
  "uplifting",
  "hope",
  "innovation",
  "record",
  "improves",
  "improvement",
  "success",
  "helping",
  "saved",
  "progress",
  "growth",
  "benefit",
  "support"
];

const NEGATIVE_KEYWORDS = [
  "war",
  "killed",
  "attack",
  "lawsuit",
  "layoff",
  "crisis",
  "scandal",
  "breach",
  "hack",
  "violence",
  "fraud",
  "collapse"
];

const POLITICS_KEYWORDS = [
  "election",
  "elections",
  "senate",
  "congress",
  "parliament",
  "lawmaker",
  "lawmakers",
  "prime minister",
  "minister",
  "president",
  "campaign",
  "democrat",
  "republican",
  "gop",
  "liberal",
  "conservative",
  "left wing",
  "right wing",
  "maga",
  "trump",
  "biden",
  "putin",
  "xi jinping",
  "netanyahu",
  "politics",
  "political",
  "geopolitics",
  "government",
  "governor",
  "policy",
  "policies",
  "diplomat",
  "diplomacy",
  "whitehall",
  "white house",
  "kremlin",
  "downing street",
  "supreme court",
  "sanction",
  "sanctions",
  "foreign ministry",
  "european union",
  "opec"
];

function normalizeForKeywordMatch(value) {
  return ` ${String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function countKeywordHits(text, keywords) {
  const normalizedText = normalizeForKeywordMatch(text);

  return keywords.reduce((count, word) => {
    const normalizedWord = normalizeForKeywordMatch(word).trim();
    if (!normalizedWord) return count;

    return count + (normalizedText.includes(` ${normalizedWord} `) ? 1 : 0);
  }, 0);
}

function isAndroidSource(source) {
  const normalized = String(source || "").toLowerCase();
  if (!normalized) return false;

  if (normalized.includes("android")) return true;

  const androidSourceHints = ["droid life", "phandroid", "talk android", "9to5google"];
  return androidSourceHints.some((hint) => normalized.includes(hint));
}

function getCategoryDecision(source, text) {
  const aiHits = countKeywordHits(text, AI_KEYWORDS);
  const androidHits = countKeywordHits(text, ANDROID_KEYWORDS);
  const makerHits = countKeywordHits(text, MAKER_KEYWORDS);
  const gamingHits = countKeywordHits(text, GAMING_KEYWORDS);
  const scienceHits = countKeywordHits(text, SCIENCE_KEYWORDS);

  const rawScores = {
    maker: makerHits,
    gaming: gamingHits,
    android: androidHits,
    science: scienceHits,
    ai: aiHits
  };

  const scores = { ...rawScores };

  // Avoid Android false positives when only a weak Android mention exists.
  const strongestNonAndroid = Math.max(scores.ai, scores.science, scores.maker, scores.gaming);
  const androidSource = isAndroidSource(source);

  if (scores.android < 2 && strongestNonAndroid >= scores.android) {
    scores.android = 0;
  }

  // Non-Android sources need stronger Android evidence to be classified as Android.
  if (!androidSource && scores.android < 3) {
    scores.android = 0;
  }

  const categoryOrder = ["maker", "gaming", "android", "science", "ai"];
  let bestCategory = "general";
  let bestScore = 0;

  for (const category of categoryOrder) {
    if (scores[category] > bestScore) {
      bestCategory = category;
      bestScore = scores[category];
    }
  }

  const category = bestScore > 0 ? bestCategory : "general";

  return {
    category,
    rawScores,
    adjustedScores: scores,
    strongestNonAndroid,
    androidSource,
    hits: {
      ai: aiHits,
      android: androidHits,
      maker: makerHits,
      gaming: gamingHits,
      science: scienceHits
    }
  };
}

function detectCategory(source, text) {
  return getCategoryDecision(source, text).category;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<references[\s\S]*?<\/references>/gi, " ")
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

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTuning(tuning = {}) {
  return {
    aiWeight: Math.max(0, Math.min(5, asNumber(tuning.aiWeight, DEFAULT_TUNING.aiWeight))),
    positivityWeight: Math.max(0.2, Math.min(3, asNumber(tuning.positivityWeight, DEFAULT_TUNING.positivityWeight))),
    negativePenaltyWeight: Math.max(0.2, Math.min(3, asNumber(tuning.negativePenaltyWeight, DEFAULT_TUNING.negativePenaltyWeight))),
    positivityThreshold: Math.max(-0.5, Math.min(1.5, asNumber(tuning.positivityThreshold, DEFAULT_TUNING.positivityThreshold)))
  };
}

function hasCouponCodeContext(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return false;

  const couponPatterns = [
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

  return couponPatterns.some((pattern) => pattern.test(text));
}

function scoreArticle(article, tuning) {
  const combined = cleanText(`${article.title} ${article.contentSnippet} ${article.content}`);
  const sentimentResult = sentiment.analyze(combined);

  const aiHits = countKeywordHits(combined, AI_KEYWORDS);
  const politicsHits = countKeywordHits(combined, POLITICS_KEYWORDS);
  const positiveHits = countKeywordHits(combined, POSITIVE_KEYWORDS);
  const negativeHits = countKeywordHits(combined, NEGATIVE_KEYWORDS);
  const hasPolitics = politicsHits > 0;
  const hasCouponCodePromo = hasCouponCodeContext(combined);

  // Hard floor: discard content that trends negative even before tuning.
  const isHardNegative = sentimentResult.comparative < -0.02 || negativeHits > 0;

  const positivityScore =
    sentimentResult.comparative * tuning.positivityWeight +
    positiveHits * 0.25 * tuning.positivityWeight -
    negativeHits * 0.35 * tuning.negativePenaltyWeight;
  const categoryDecision = getCategoryDecision(article.source, combined);
  const category = categoryDecision.category;
  const rankScore = aiHits * tuning.aiWeight + positivityScore;

  return {
    ...article,
    category,
    aiScore: aiHits,
    politicsHits,
    hasPolitics,
    hasCouponCodePromo,
    isHardNegative,
    rankScore,
    positivityScore,
    isPositive: positivityScore > tuning.positivityThreshold,
    sentimentScore: sentimentResult.score
  };
}

function getCategoryDebug(article) {
  const combined = cleanText(`${article?.title || ""} ${article?.contentSnippet || ""} ${article?.content || ""}`);
  const decision = getCategoryDecision(article?.source || "", combined);

  return {
    source: article?.source || "",
    title: article?.title || "",
    category: decision.category,
    existingCategory: article?.category || null,
    hits: decision.hits,
    rawScores: decision.rawScores,
    adjustedScores: decision.adjustedScores,
    strongestNonAndroid: decision.strongestNonAndroid,
    androidSource: decision.androidSource,
    preview: combined.slice(0, 240)
  };
}

function analyzeAndFilterArticles(articles, tuningInput = DEFAULT_TUNING) {
  const tuning = normalizeTuning(tuningInput);

  return articles
    .map((article) => scoreArticle(article, tuning))
    .filter((article) => !article.hasPolitics)
    .filter((article) => !article.hasCouponCodePromo)
    .filter((article) => !article.isHardNegative)
    .filter((article) => article.isPositive)
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      if (b.aiScore !== a.aiScore) return b.aiScore - a.aiScore;
      if (b.positivityScore !== a.positivityScore) return b.positivityScore - a.positivityScore;
      return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    });
}

module.exports = {
  DEFAULT_TUNING,
  normalizeTuning,
  analyzeAndFilterArticles,
  getCategoryDebug
};
