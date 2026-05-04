const Sentiment = require("sentiment");

const sentiment = new Sentiment();

const DEFAULT_TUNING = {
  aiWeight: 2.5,
  positivityWeight: 2.2,
  negativePenaltyWeight: 3,
  positivityThreshold: 0.45
};

// ---------------------------------------------------------------------------
// Keyword configuration
//
// Edit these lists to tune what counts as relevant / positive / negative /
// political. The structure is intentionally explicit so each axis can be
// tuned without affecting the others.
//
// `strong` keywords are high-confidence multi-word phrases. They count more
// toward category relevance and they're enough on their own to assign an
// article to a category.
//
// `weak` keywords are short / common terms that are useful as supporting
// evidence but should never categorize an article on their own.
// ---------------------------------------------------------------------------
const KEYWORDS = {
  categories: {
    ai: {
      strong: [
        "artificial intelligence",
        "machine learning",
        "deep learning",
        "neural network",
        "generative ai",
        "large language model",
        "small language model",
        "foundation model",
        "frontier model",
        "transformer model",
        "diffusion model",
        "stable diffusion",
        "image generation",
        "text generation",
        "video generation",
        "voice cloning",
        "text-to-image",
        "text-to-video",
        "computer vision",
        "natural language processing",
        "retrieval augmented generation",
        "vector database",
        "prompt engineering",
        "synthetic data",
        "ai agent",
        "autonomous agent",
        "agentic ai",
        "ai chip",
        "ai accelerator",
        "ai safety",
        "ai alignment",
        "responsible ai",
        "ai ethics",
        "github copilot",
        "microsoft copilot",
        "google deepmind",
        "hugging face",
        "openai",
        "anthropic",
        "deepmind",
        "mistral ai"
      ],
      weak: [
        "ai",
        "llm",
        "slm",
        "nlp",
        "rag",
        "genai",
        "multimodal",
        "embedding",
        "fine-tuning",
        "inference",
        "chatgpt",
        "gpt-4",
        "gpt-5",
        "claude",
        "gemini",
        "perplexity",
        "llama",
        "mistral",
        "deepseek",
        "grok",
        "dall-e",
        "midjourney",
        "sora",
        "runway",
        "copilot"
      ]
    },

    android: {
      strong: [
        "android open source project",
        "android security update",
        "android security patch",
        "google play store",
        "google play services",
        "google mobile services",
        "google pixel",
        "pixel phone",
        "pixel fold",
        "pixel watch",
        "pixel tablet",
        "pixel feature drop",
        "google tensor",
        "tensor chip",
        "samsung galaxy",
        "galaxy fold",
        "galaxy flip",
        "one ui",
        "motorola razr",
        "moto g",
        "nothing phone",
        "asus rog phone",
        "sony xperia",
        "android studio",
        "jetpack compose",
        "kotlin android",
        "android sdk",
        "android ndk",
        "android tablet",
        "android tv",
        "google tv",
        "wear os",
        "android auto",
        "android automotive",
        "android xr",
        "circle to search",
        "find my device",
        "custom rom",
        "lineageos",
        "grapheneos",
        "calyxos",
        "unlock bootloader",
        "factory image",
        "firmware update",
        "feature drop",
        "material you",
        "foldable phone",
        "flip phone",
        "smartphone",
        "mobile phone"
      ],
      weak: [
        "android",
        "aosp",
        "apk",
        "sideload",
        "fdroid",
        "f-droid",
        "pixel",
        "galaxy s",
        "galaxy z",
        "oneplus",
        "oxygenos",
        "xiaomi",
        "hyperos",
        "redmi",
        "poco",
        "oppo",
        "realme",
        "vivo",
        "honor",
        "snapdragon",
        "mediatek",
        "dimensity",
        "exynos",
        "esim",
        "rcs",
        "magisk",
        "ota update"
      ]
    },

    science: {
      strong: [
        "peer reviewed",
        "peer-reviewed",
        "clinical trial",
        "clinical success",
        "drug discovery",
        "stem cell",
        "gene editing",
        "synthetic biology",
        "carbon capture",
        "renewable energy",
        "particle physics",
        "quantum computing",
        "quantum mechanics",
        "computer science",
        "materials science",
        "earth science",
        "environmental science",
        "james webb",
        "jwst",
        "hubble",
        "exoplanet",
        "black hole",
        "asteroid",
        "comet",
        "spacecraft",
        "satellite",
        "biotechnology",
        "neuroscience",
        "microbiology",
        "virology",
        "immunology",
        "cancer research",
        "nanotechnology",
        "battery technology",
        "superconductor",
        "fusion reactor",
        "nuclear fusion",
        "deep sea",
        "marine biology",
        "conservation success",
        "species recovery",
        "wildlife conservation",
        "biodiversity"
      ],
      weak: [
        "science",
        "scientific",
        "scientist",
        "scientists",
        "research",
        "researchers",
        "study",
        "studies",
        "experiment",
        "discovery",
        "breakthrough",
        "physics",
        "quantum",
        "astrophysics",
        "astronomy",
        "cosmology",
        "space",
        "planet",
        "mars",
        "moon",
        "nasa",
        "esa",
        "spacex",
        "rocket",
        "climate",
        "geology",
        "volcano",
        "ocean",
        "oceanography",
        "atmosphere",
        "biology",
        "biotech",
        "genetics",
        "genomics",
        "dna",
        "rna",
        "crispr",
        "vaccine",
        "chemistry",
        "robotics",
        "engineering",
        "mathematics",
        "math",
        "polymer",
        "catalyst"
      ]
    },

    maker: {
      strong: [
        // Maker / hobby
        "raspberry pi",
        "raspberry pi pico",
        "arduino",
        "esp32",
        "esp8266",
        "single board computer",
        "hobby electronics",
        "hardware hacking",
        "open source hardware",
        "diy electronics",
        "soldering iron",
        "logic analyzer",
        "oscilloscope",
        "stepper motor",
        // Radio / wireless
        "ham radio",
        "amateur radio",
        "software defined radio",
        "lorawan",
        "meshtastic",
        "meshcore",
        "flipper zero",
        "rtl-sdr",
        // 3D printing - general
        "3d printing",
        "3d printer",
        "3d printers",
        "additive manufacturing",
        "fdm printer",
        "fff printer",
        "resin printer",
        "sla printer",
        "msla printer",
        "3d model",
        "stl file",
        "3mf file",
        "g-code",
        "auto bed leveling",
        "first layer",
        "layer height",
        "print speed",
        "print bed",
        "build plate",
        "pei sheet",
        "heated bed",
        "filament dryer",
        "carbon fiber filament",
        "silk pla",
        "multi-material",
        "direct drive",
        // Brands
        "bambu lab",
        "bambu studio",
        "prusa slicer",
        "prusaslicer",
        "orca slicer",
        "creality ender",
        "voron printer",
        "elegoo printer",
        "anycubic printer",
        "formlabs printer",
        "ultimaker printer",
        // Tools / equipment
        "laser cutter",
        "vinyl cutter",
        "cnc router",
        // CAD / design / EDA software
        "fusion 360",
        "autodesk fusion",
        "freecad",
        "openscad",
        "tinkercad",
        "onshape",
        "solidworks",
        "shapr3d",
        "plasticity 3d",
        "blender 3d",
        "sketchup",
        "inkscape",
        "kicad",
        "easyeda",
        "eagle pcb",
        "fritzing",
        "computer aided design",
        "parametric modeling",
        "cad model",
        "cad software",
        "3d cad",
        "3d modeling",
        "3d design",
        "home assistant",
        "home automation",
        "smart home",
        "klipper firmware",
        "marlin firmware",
        "octoprint",
        "mainsail",
        "fluidd",
        // Project / tutorial framing common in maker writing
        "diy project",
        "weekend project",
        "build guide",
        "step by step build",
        "hardware project",
        "electronics project",
        "retro computing",
        "retro gaming build",
        "build a",
        "how i built",
        // Pi-ecosystem unambiguous identifiers
        "pi camera",
        "pi 5",
        "pi 4",
        "pi zero",
        "pico w"
      ],
      weak: [
        "maker",
        "makerspace",
        "diy",
        "breadboard",
        "perfboard",
        "stripboard",
        "microcontroller",
        "embedded",
        "soldering",
        "solder",
        "reflow",
        "pcb",
        "neopixel",
        "servo",
        "lora",
        "sdr",
        "iot",
        "mqtt",
        "zigbee",
        "z-wave",
        "ble",
        "jtag",
        "uart",
        "spi",
        "i2c",
        "gpio",
        "fpga",
        "cnc",
        "filament",
        "pla",
        "petg",
        "abs",
        "asa",
        "tpu",
        "ams",
        "hotend",
        "nozzle",
        "extruder",
        "bowden",
        "slicer",
        "cura",
        "prusa",
        "creality",
        "ender",
        "voron",
        "elegoo",
        "anycubic",
        "formlabs",
        "ultimaker",
        "bambu",
        // CAD / EDA — short forms
        "cad",
        "fusion360",
        "blender",
        "klipper",
        // Pi ecosystem short forms
        "rpi",
        "pico",
        "picamera",
        "hat",
        "phat",
        "bonnet",
        "home-assistant",
        "hass",
        "hassio",
        "node-red",
        "nodered",
        "esphome",
        // Print-problem terms — kept here to help categorize. Analyzer
        // treats these as neutral so troubleshooting articles still surface.
        "stringing",
        "warping",
        "bed adhesion",
        "z-offset",
        "supports",
        "infill"
      ]
    },

    gaming: {
      strong: [
        "video game",
        "video games",
        "game developer",
        "game development",
        "game studio",
        "game engine",
        "game release",
        "game launch",
        "early access",
        "patch notes",
        "expansion pack",
        "indie game",
        "cozy game",
        "horror game",
        "survival game",
        "strategy game",
        "simulation game",
        "battle royale",
        "metroidvania",
        "roguelike",
        "roguelite",
        "soulslike",
        "online co-op",
        "cross-play",
        "crossplay",
        "cloud gaming",
        "handheld gaming",
        "pc gaming",
        "xbox series x",
        "xbox series s",
        "xbox game pass",
        "playstation plus",
        "nintendo switch",
        "switch 2",
        "steam deck",
        "epic games store",
        "asus rog ally",
        "lenovo legion go",
        "geforce now",
        "xbox cloud gaming",
        "remote play",
        "unreal engine",
        "unity engine",
        "ray tracing",
        "speedrun",
        "speedrunning",
        "twitch streamer",
        "animal crossing",
        "elder scrolls",
        "world of warcraft",
        "league of legends",
        "counter-strike",
        "apex legends",
        "call of duty",
        "grand theft auto",
        "baldur's gate",
        "elden ring",
        "the last of us",
        "god of war",
        "spider-man",
        "final fantasy",
        "dragon quest",
        "gears of war"
      ],
      weak: [
        "gaming",
        "gamer",
        "game pass",
        "playstation",
        "ps5",
        "ps4",
        "nintendo",
        "xbox",
        "esports",
        "e-sports",
        "tournament",
        "multiplayer",
        "co-op",
        "modding",
        "dlc",
        "remaster",
        "remake",
        "fps",
        "rpg",
        "jrpg",
        "mmo",
        "mmorpg",
        "godot",
        "dlss",
        "fsr",
        "zelda",
        "mario",
        "pokemon",
        "pokémon",
        "metroid",
        "halo",
        "forza",
        "skyrim",
        "fallout",
        "starfield",
        "doom",
        "diablo",
        "warcraft",
        "minecraft",
        "fortnite",
        "roblox",
        "valorant",
        "dota",
        "gta"
      ]
    },

    tech: {
      strong: [
        // General software / dev
        "open source",
        "self-hosted",
        "self hosting",
        "homelab",
        "home server",
        "version control",
        "package manager",
        // Cybersecurity (positive interest topic)
        "zero-day",
        "zero day",
        "supply chain attack",
        "responsible disclosure",
        "bug bounty",
        "patch tuesday",
        "security update",
        "security advisory",
        "ctf challenge",
        "reverse engineering",
        "penetration testing",
        // Infra / cloud
        "data center",
        "edge computing",
        "kubernetes cluster"
      ],
      weak: [
        "software",
        "hardware",
        "tech",
        "technology",
        "developer",
        "developers",
        "coding",
        "programming",
        "programmer",
        "startup",
        "linux",
        "ubuntu",
        "debian",
        "fedora",
        "arch linux",
        "macos",
        "windows 11",
        "docker",
        "kubernetes",
        "container",
        "github",
        "gitlab",
        "git",
        "api",
        "rest api",
        "graphql",
        "sdk",
        // Cybersecurity weak terms — nudge category, never drop articles.
        "cybersecurity",
        "infosec",
        "hacker",
        "hacking",
        "malware",
        "ransomware",
        "phishing",
        "exploit",
        "vulnerability",
        "cve",
        "breach",
        "data breach",
        "patch",
        "encryption",
        "firewall"
      ]
    }
  },

  // Strong, unambiguous positive terms. The sentiment library already handles
  // general positive tone, so this list stays tight to avoid false positives.
  positiveBoost: [
    "uplifting",
    "inspiring",
    "heartwarming",
    "feel-good",
    "good news",
    "positive news",
    "breakthrough",
    "innovation",
    "innovative",
    "milestone",
    "achievement",
    "success story",
    "rescued",
    "rescue mission",
    "restored",
    "rebuilt",
    "life-saving",
    "saves lives",
    "promising results",
    "effective treatment",
    "clean energy",
    "conservation success",
    "species recovery",
    "expands access",
    "empowers",
    "empowering",
    "accessible",
    "affordable",
    "donated",
    "donation",
    "volunteer",
    "kindness",
    "generosity"
  ],

  // Hard negatives — articles that match these are dropped.
  hardNegative: [
    // War / terrorism / violence
    "war",
    "civil war",
    "invasion",
    "airstrike",
    "missile strike",
    "bombing",
    "bomb attack",
    "terrorist",
    "terrorism",
    "hostage",
    "kidnapping",
    "abduction",
    // Death / serious crime
    "killed",
    "dead",
    "death",
    "deaths",
    "fatal",
    "murder",
    "manslaughter",
    "shooting",
    "stabbing",
    "rape",
    "sexual assault",
    "mass shooting",
    "gun violence",
    // Disasters
    "disaster",
    "catastrophe",
    "famine",
    "drought",
    "wildfire",
    "hurricane",
    "tornado",
    "earthquake destroyed",
    "deadly flood",
    "pandemic",
    "outbreak",
    // Major financial / scandal
    "bankruptcy",
    "embezzlement",
    "bribery",
    "corruption scandal",
    "ponzi scheme",
    "money laundering"
  ],

  // Soft negatives — lower the positivity score but don't auto-drop. Cyber
  // terms ("attack", "breach") live here so security reporting still surfaces.
  softNegative: [
    "attack",
    "attacks",
    "attacked",
    "lawsuit",
    "sued",
    "scandal",
    "fraud",
    "allegations",
    "arrested",
    "charged",
    "convicted",
    "shutdown",
    "shut down",
    "outage",
    "layoff",
    "layoffs",
    "job cuts",
    "shortage",
    "delayed",
    "controversy",
    "controversial",
    "criticized",
    "backlash",
    "warning",
    "concerns"
  ],

  // Hard politics — present anywhere → drop. "policy" / "regulation" are
  // intentionally NOT here: too noisy in tech writing ("privacy policy",
  // "AI regulation", "cookie policy"). Real political articles will hit
  // multiple terms below.
  hardPolitics: [
    // Elections / campaigns
    "election",
    "elections",
    "electoral",
    "ballot",
    "primary election",
    "caucus",
    "voter turnout",
    "campaign rally",
    "campaign trail",
    "presidential candidate",
    "candidate for",
    "incumbent",
    "ruling party",
    "opposition party",
    "coalition government",
    // Legislatures / lawmakers
    "senate",
    "senator",
    "congress",
    "congressional",
    "house of representatives",
    "parliament",
    "parliamentary",
    "lawmaker",
    "lawmakers",
    "legislature",
    // Heads of state / political offices
    "president",
    "vice president",
    "prime minister",
    "chancellor",
    "governor",
    "mayor",
    "cabinet member",
    "secretary of state",
    "attorney general",
    "ambassador",
    // Parties / ideology
    "democrat",
    "democrats",
    "republican",
    "republicans",
    "gop",
    "maga",
    "left wing",
    "left-wing",
    "right wing",
    "right-wing",
    "far left",
    "far-left",
    "far right",
    "far-right",
    "populist",
    "nationalist",
    // Institutions / locations
    "white house",
    "capitol hill",
    "supreme court",
    "scotus",
    "justice department",
    "department of justice",
    "kremlin",
    "european commission",
    "european parliament",
    "united nations",
    "u.n. security council",
    "nato summit",
    "world bank",
    // Foreign policy levers
    "diplomacy",
    "diplomat",
    "diplomatic",
    "sanctions",
    "sanctioned",
    "tariff",
    "tariffs",
    "trade war",
    "executive order",
    // Named figures (current era)
    "trump",
    "biden",
    "putin",
    "xi jinping",
    "netanyahu",
    "zelensky",
    "macron",
    "starmer",
    "modi",
    "erdogan",
    "orban",
    "milei"
  ],

  // Source-name hints — used only to nudge category, never to filter.
  sourceHints: {
    android: ["android", "9to5google", "droid life", "phandroid", "talk android"],
    tech: ["hacker news", "ars technica", "the register", "bleeping computer", "krebs"],
    maker: [
      "hackaday",
      "hackster",
      "tom's hardware",
      "all3dp",
      "raspberry pi",
      "jeff geerling",
      "pi hut",
      "pimoroni",
      "pi my life up",
      "raspberrytips",
      "raspberrypi",
      "recantha",
      "pi3g",
      "peppe8o",
      "switchdoc",
      "ozzmaker",
      "picockpit",
      "raspberry pipod",
      "raspberry pi spy",
      "factoryforward",
      "opensource.com",
      "alex ellis",
      "embedded lab",
      "circuit specialists",
      "cat lamin",
      "rantings"
    ],
    gaming: ["polygon", "kotaku", "ign", "rock paper", "eurogamer", "pc gamer"],
    science: ["nature", "scientific american", "new scientist", "phys.org", "sciencealert"]
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeForKeywordMatch(value) {
  return ` ${String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function countKeywordHits(normalizedText, keywords) {
  let count = 0;
  for (const word of keywords) {
    const normalizedWord = normalizeForKeywordMatch(word).trim();
    if (!normalizedWord) continue;
    if (normalizedText.includes(` ${normalizedWord} `)) count += 1;
  }
  return count;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
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

// ---------------------------------------------------------------------------
// Per-axis scoring
// ---------------------------------------------------------------------------

const CATEGORY_NAMES = ["maker", "gaming", "android", "ai", "science", "tech"];

// Title hits weighted heaviest because titles are the strongest signal.
// Strong keywords weighted ×2 over weak.
function scoreCategories(normalizedTitle, normalizedBody, source) {
  const sourceLower = String(source || "").toLowerCase();
  const result = {};

  for (const name of CATEGORY_NAMES) {
    const def = KEYWORDS.categories[name];
    const titleStrong = countKeywordHits(normalizedTitle, def.strong);
    const titleWeak = countKeywordHits(normalizedTitle, def.weak);
    const bodyStrong = countKeywordHits(normalizedBody, def.strong);
    const bodyWeak = countKeywordHits(normalizedBody, def.weak);

    let score = titleStrong * 6 + titleWeak * 3 + bodyStrong * 2 + bodyWeak * 1;

    const hints = KEYWORDS.sourceHints[name] || [];
    if (hints.some((hint) => sourceLower.includes(hint))) {
      score += 2;
    }

    result[name] = {
      score,
      strongHits: titleStrong + bodyStrong,
      weakHits: titleWeak + bodyWeak
    };
  }

  return result;
}

function pickCategory(categoryScores) {
  // Preference order: specific categories beat the generic "tech" bucket.
  const preferenceOrder = ["maker", "gaming", "android", "ai", "science", "tech"];

  let best = "tech";
  let bestScore = 0;

  for (const name of preferenceOrder) {
    const s = categoryScores[name].score;
    if (s > bestScore) {
      best = name;
      bestScore = s;
    }
  }

  // Need a meaningful match to claim a specific category.
  if (best !== "tech" && bestScore < 3) {
    best = "tech";
  }

  return { category: best, score: bestScore };
}

function scorePolitics(normalizedText) {
  return countKeywordHits(normalizedText, KEYWORDS.hardPolitics);
}

function scoreNegativity(normalizedText) {
  return {
    hard: countKeywordHits(normalizedText, KEYWORDS.hardNegative),
    soft: countKeywordHits(normalizedText, KEYWORDS.softNegative)
  };
}

function scorePositivity(normalizedText, sentimentComparative, tuning, softHits, categoryStrongHits) {
  const positiveHits = countKeywordHits(normalizedText, KEYWORDS.positiveBoost);

  return (
    sentimentComparative * tuning.positivityWeight +
    positiveHits * 0.3 * tuning.positivityWeight -
    softHits * 0.25 * tuning.negativePenaltyWeight +
    Math.min(categoryStrongHits, 4) * 0.15
  );
}

// ---------------------------------------------------------------------------
// Main scoring entrypoint
// ---------------------------------------------------------------------------

function scoreArticle(article, tuning) {
  const titleText = cleanText(article.title);
  const bodyText = cleanText(`${article.contentSnippet || ""} ${article.content || ""}`);
  const combinedText = `${titleText} ${bodyText}`;

  const normalizedTitle = normalizeForKeywordMatch(titleText);
  const normalizedBody = normalizeForKeywordMatch(bodyText);
  const normalizedAll = normalizeForKeywordMatch(combinedText);

  const categoryScores = scoreCategories(normalizedTitle, normalizedBody, article.source);
  const { category, score: categoryScore } = pickCategory(categoryScores);
  const categoryStrongHits = categoryScores[category].strongHits;

  const politicsHits = scorePolitics(normalizedAll);
  const { hard: hardNegHits, soft: softNegHits } = scoreNegativity(normalizedAll);
  const hasCouponCodePromo = hasCouponCodeContext(combinedText);

  const sentimentResult = sentiment.analyze(combinedText);
  const positivityScore = scorePositivity(
    normalizedAll,
    sentimentResult.comparative,
    tuning,
    softNegHits,
    categoryStrongHits
  );

  // Strong category match bypasses the positivity threshold so factual /
  // tutorial / troubleshooting articles in our interest areas still surface
  // even when their tone is neutral. Triggered when an article is clearly
  // about one of our categories.
  const isStrongCategoryMatch = categoryStrongHits >= 1 && categoryScore >= 6;
  // Maker / Android / AI tutorials are often dry but on-topic — let any
  // article with a high category score through.
  const isClearCategoryHit = category !== "tech" && categoryScore >= 9;
  // Cybersecurity / cyber-attack stories live in `tech` and are flagged as
  // "soft negative" by words like "attack" or "breach" — keep them when the
  // article is clearly about tech.
  const isCyberContext = category === "tech" && categoryScore >= 6 && hardNegHits === 0;
  const isPositive =
    positivityScore > tuning.positivityThreshold ||
    isStrongCategoryMatch ||
    isClearCategoryHit ||
    isCyberContext;

  const aiHits = categoryScores.ai.strongHits + categoryScores.ai.weakHits;
  const rankScore =
    aiHits * tuning.aiWeight +
    positivityScore +
    Math.min(categoryScore, 30) * 0.05;

  return {
    ...article,
    category,
    categoryScore,
    categoryStrongHits,
    aiScore: aiHits,
    politicsHits,
    hasPolitics: politicsHits > 0,
    hardNegHits,
    softNegHits,
    isHardNegative: hardNegHits > 0,
    hasCouponCodePromo,
    positivityScore,
    isPositive,
    rankScore,
    sentimentScore: sentimentResult.score
  };
}

function getCategoryDebug(article) {
  const tuning = DEFAULT_TUNING;
  const scored = scoreArticle(article || {}, tuning);

  const titleText = cleanText(article?.title || "");
  const bodyText = cleanText(`${article?.contentSnippet || ""} ${article?.content || ""}`);
  const normalizedTitle = normalizeForKeywordMatch(titleText);
  const normalizedBody = normalizeForKeywordMatch(bodyText);
  const categoryScores = scoreCategories(normalizedTitle, normalizedBody, article?.source);

  return {
    source: article?.source || "",
    title: article?.title || "",
    category: scored.category,
    existingCategory: article?.category || null,
    categoryScores,
    categoryStrongHits: scored.categoryStrongHits,
    politicsHits: scored.politicsHits,
    hardNegHits: scored.hardNegHits,
    softNegHits: scored.softNegHits,
    positivityScore: scored.positivityScore,
    rankScore: scored.rankScore,
    isPositive: scored.isPositive,
    preview: `${titleText} — ${bodyText}`.slice(0, 240)
  };
}

function analyzeAndFilterArticles(articles, tuningInput = DEFAULT_TUNING) {
  const tuning = normalizeTuning(tuningInput);

  return articles
    .map((article) => scoreArticle(article, tuning))
    .filter((article) => !article.hasCouponCodePromo)
    .filter((article) => !article.hasPolitics)
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
  KEYWORDS,
  normalizeTuning,
  analyzeAndFilterArticles,
  getCategoryDebug
};
