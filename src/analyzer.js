const Sentiment = require("sentiment");

const sentiment = new Sentiment();

const DEFAULT_TUNING = {
  aiWeight: 1.8,
  positivityWeight: 1,
  negativePenaltyWeight: 1,
  positivityThreshold: 0.05
};

const AI_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "llm",
  "large language model",
  "openai",
  "anthropic",
  "deepmind",
  "nvidia",
  "copilot",
  "chatgpt"
];

const TECH_KEYWORDS = [
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
  "gadget"
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

function countKeywordHits(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.reduce((count, word) => {
    return count + (lower.includes(word) ? 1 : 0);
  }, 0);
}

function detectCategory(text) {
  const aiHits = countKeywordHits(text, AI_KEYWORDS);
  if (aiHits > 0) {
    return "ai";
  }

  const gamingHits = countKeywordHits(text, GAMING_KEYWORDS);
  if (gamingHits > 0) {
    return "gaming";
  }

  const techHits = countKeywordHits(text, TECH_KEYWORDS);
  if (techHits > 0) {
    return "tech";
  }

  return "general";
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
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

function scoreArticle(article, tuning) {
  const combined = cleanText(`${article.title} ${article.contentSnippet} ${article.content}`);
  const sentimentResult = sentiment.analyze(combined);

  const aiHits = countKeywordHits(combined, AI_KEYWORDS);
  const positiveHits = countKeywordHits(combined, POSITIVE_KEYWORDS);
  const negativeHits = countKeywordHits(combined, NEGATIVE_KEYWORDS);

  const positivityScore =
    sentimentResult.comparative * tuning.positivityWeight +
    positiveHits * 0.25 * tuning.positivityWeight -
    negativeHits * 0.35 * tuning.negativePenaltyWeight;
  const category = detectCategory(combined);
  const rankScore = aiHits * tuning.aiWeight + positivityScore;

  return {
    ...article,
    category,
    aiScore: aiHits,
    rankScore,
    positivityScore,
    isPositive: positivityScore > tuning.positivityThreshold,
    sentimentScore: sentimentResult.score
  };
}

function analyzeAndFilterArticles(articles, tuningInput = DEFAULT_TUNING) {
  const tuning = normalizeTuning(tuningInput);

  return articles
    .map((article) => scoreArticle(article, tuning))
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
  analyzeAndFilterArticles
};
