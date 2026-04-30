const state = {
  allArticles: [],
  selectedFilter: "all",
  nextRefreshAt: null,
  tickTimer: null,
  settings: null
};

const articleContainer = document.getElementById("articles");
const statusLine = document.getElementById("statusLine");
const lastUpdatedNode = document.getElementById("lastUpdated");
const nextRefreshNode = document.getElementById("nextRefresh");
const feedStatsNode = document.getElementById("feedStats");
const refreshBtn = document.getElementById("refreshBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const template = document.getElementById("articleTemplate");

const settingFields = [
  "aiWeight",
  "positivityWeight",
  "negativePenaltyWeight",
  "positivityThreshold"
];

function setSettingsUI(settings) {
  if (!settings) return;

  state.settings = settings;

  settingFields.forEach((key) => {
    const input = document.getElementById(key);
    const valueNode = document.getElementById(`${key}Value`);
    if (!input || !valueNode) return;

    input.value = String(settings[key]);
    const digits = key === "positivityThreshold" ? 2 : 1;
    valueNode.textContent = Number(settings[key]).toFixed(digits);
  });
}

function readSettingsFromUI() {
  return settingFields.reduce((acc, key) => {
    const input = document.getElementById(key);
    acc[key] = Number(input.value);
    return acc;
  }, {});
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function friendlyTimeUntil(targetIso) {
  if (!targetIso) return "Unknown";
  const deltaMs = new Date(targetIso).getTime() - Date.now();
  if (deltaMs <= 0) return "Refreshing soon";

  const totalMinutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function renderFeedStats(feedStats) {
  feedStatsNode.innerHTML = "";

  feedStats.forEach((stat) => {
    const div = document.createElement("div");
    div.className = "stat-card";

    const left = document.createElement("div");
    left.textContent = `${stat.label} (${stat.count})`;

    const right = document.createElement("div");
    right.className = stat.ok ? "stat-ok" : "stat-error";
    right.textContent = stat.ok ? `${stat.durationMs}ms` : "failed";
    right.title = stat.error || "";

    div.append(left, right);
    feedStatsNode.append(div);
  });
}

function renderArticles() {
  articleContainer.innerHTML = "";

  const visible =
    state.selectedFilter === "all"
      ? state.allArticles
      : state.allArticles.filter((article) => article.category === state.selectedFilter);

  statusLine.textContent = `Showing ${visible.length} uplifting articles`;

  visible.forEach((article) => {
    const clone = template.content.cloneNode(true);
    clone.querySelector(".category").textContent = article.category;
    clone.querySelector(".source").textContent = article.source;
    clone.querySelector(".story-title").textContent = article.title;
    const snippetNode = clone.querySelector(".story-snippet");
    const expandBtn = clone.querySelector(".expand-btn");
    const fullSnippet = article.contentSnippet || "Positive trend detected in this story.";

    snippetNode.textContent = fullSnippet;
    snippetNode.classList.add("collapsed");

    const shouldTruncate = fullSnippet.length > 180;
    if (shouldTruncate) {
      expandBtn.hidden = false;
      expandBtn.textContent = "Expand";

      let expanded = false;
      expandBtn.addEventListener("click", () => {
        expanded = !expanded;
        snippetNode.classList.toggle("collapsed", !expanded);
        expandBtn.textContent = expanded ? "Collapse" : "Expand";
      });
    }

    clone.querySelector(".story-date").textContent = formatDate(article.pubDate);

    const link = clone.querySelector(".story-link");
    link.href = article.link;

    articleContainer.append(clone);
  });
}

function startRefreshTicker() {
  if (state.tickTimer) clearInterval(state.tickTimer);

  state.tickTimer = setInterval(() => {
    nextRefreshNode.textContent = friendlyTimeUntil(state.nextRefreshAt);
  }, 30000);
}

async function loadArticles(force = false) {
  statusLine.textContent = force ? "Refreshing feeds..." : "Loading feeds...";

  const endpoint = force ? "/api/refresh" : "/api/articles";
  const method = force ? "POST" : "GET";

  const response = await fetch(endpoint, { method });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();

  state.allArticles = data.articles || [];
  state.nextRefreshAt = data.nextRefreshAt || null;
  setSettingsUI(data.settings || null);

  lastUpdatedNode.textContent = formatDate(data.updatedAt);
  nextRefreshNode.textContent = friendlyTimeUntil(data.nextRefreshAt);
  renderFeedStats(data.feedStats || []);
  renderArticles();
  startRefreshTicker();
}

async function saveSettings() {
  statusLine.textContent = "Saving scoring settings...";
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(readSettingsFromUI())
  });

  if (!response.ok) {
    throw new Error(`Settings update failed: ${response.status}`);
  }

  const data = await response.json();
  state.allArticles = data.articles || [];
  state.nextRefreshAt = data.nextRefreshAt || null;
  setSettingsUI(data.settings || null);
  lastUpdatedNode.textContent = formatDate(data.updatedAt);
  nextRefreshNode.textContent = friendlyTimeUntil(data.nextRefreshAt);
  renderFeedStats(data.feedStats || []);
  renderArticles();
}

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((node) => node.classList.remove("active"));
    chip.classList.add("active");
    state.selectedFilter = chip.dataset.filter;
    renderArticles();
  });
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  try {
    await loadArticles(true);
  } catch (error) {
    console.error(error);
    statusLine.textContent = "Refresh failed. Try again in a moment.";
  } finally {
    refreshBtn.disabled = false;
  }
});

settingFields.forEach((key) => {
  const input = document.getElementById(key);
  const valueNode = document.getElementById(`${key}Value`);
  const digits = key === "positivityThreshold" ? 2 : 1;

  input.addEventListener("input", () => {
    valueNode.textContent = Number(input.value).toFixed(digits);
  });
});

saveSettingsBtn.addEventListener("click", async () => {
  saveSettingsBtn.disabled = true;
  try {
    await saveSettings();
  } catch (error) {
    console.error(error);
    statusLine.textContent = "Could not update settings. Please retry.";
  } finally {
    saveSettingsBtn.disabled = false;
  }
});

loadArticles(false).catch((error) => {
  console.error(error);
  statusLine.textContent = "Could not load feeds. Check your internet and server logs.";
});
