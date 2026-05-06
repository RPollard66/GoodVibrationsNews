const state = {
  allArticles: [],
  selectedFilter: "all"
};

const articleContainer = document.getElementById("articles");
const statusLine = document.getElementById("statusLine");
const template = document.getElementById("articleTemplate");

const newsView = document.getElementById("newsView");
const feedsView = document.getElementById("feedsView");
const manageFeedsBtn = document.getElementById("manageFeedsBtn");
const refreshNowBtn = document.getElementById("refreshNowBtn");
const feedsList = document.getElementById("feedsList");
const feedsStatus = document.getElementById("feedsStatus");
const addFeedForm = document.getElementById("addFeedForm");
const feedLabelInput = document.getElementById("feedLabelInput");
const feedUrlInput = document.getElementById("feedUrlInput");
const feedCategoryInput = document.getElementById("feedCategoryInput");
const maxTotalForm = document.getElementById("maxTotalForm");
const maxTotalInput = document.getElementById("maxTotalInput");
const maxTotalHint = document.getElementById("maxTotalHint");
const maxTotalValue = document.getElementById("maxTotalValue");
const perFeedCapForm = document.getElementById("perFeedCapForm");
const perFeedCapInput = document.getElementById("perFeedCapInput");
const perFeedCapValue = document.getElementById("perFeedCapValue");
const tuneTopicsList = document.getElementById("tuneTopicsList");

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function updateFilterChips() {
  const counts = state.allArticles.reduce((acc, a) => {
    const c = a.category || "general";
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});

  document.querySelectorAll(".filter-chip").forEach((chip) => {
    const filter = chip.dataset.filter;
    const labelBase = chip.dataset.label || (chip.dataset.label = chip.textContent.replace(/\s*\(\d+\)\s*$/, ""));
    if (filter === "all") {
      chip.hidden = false;
      chip.textContent = `${labelBase} (${state.allArticles.length})`;
      return;
    }
    const count = counts[filter] || 0;
    if (count === 0) {
      chip.hidden = true;
      if (state.selectedFilter === filter) {
        state.selectedFilter = "all";
        document.querySelectorAll(".filter-chip").forEach((n) => n.classList.remove("active"));
        const allChip = document.querySelector('.filter-chip[data-filter="all"]');
        if (allChip) allChip.classList.add("active");
      }
    } else {
      chip.hidden = false;
      chip.textContent = `${labelBase} (${count})`;
    }
  });
}

function renderArticles() {
  articleContainer.innerHTML = "";

  const visible = state.selectedFilter === "all"
    ? state.allArticles
    : state.allArticles.filter((article) => article.category === state.selectedFilter);

  updateFilterChips();
  statusLine.textContent = `Showing ${visible.length} articles`;

  visible.forEach((article) => {
    const clone = template.content.cloneNode(true);
    clone.querySelector(".category").textContent = article.category;
    clone.querySelector(".source").textContent = article.source;
    clone.querySelector(".story-title").textContent = article.title;
    const snippetNode = clone.querySelector(".story-snippet");
    const expandBtn = clone.querySelector(".expand-btn");
    const fullSnippet = article.contentSnippet || "";

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

async function loadArticles() {
  statusLine.textContent = "Loading feeds...";

  const response = await fetch("/api/articles");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const data = await response.json();
  state.allArticles = data.articles || [];
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

// ---------------------------------------------------------------------------
// Feeds management
// ---------------------------------------------------------------------------

function showFeedsView(show) {
  feedsView.hidden = !show;
  newsView.hidden = !!show;
  manageFeedsBtn.textContent = show ? "Back to news" : "Manage feeds";
  if (show) loadFeeds();
}

let availableCategories = [
  "science", "ai", "maker", "gaming", "android", "tech",
  "radio", "green", "birding", "weather", "general"
];

function populateCategorySelect(select, selected) {
  select.innerHTML = "";
  availableCategories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    if (cat === selected) opt.selected = true;
    select.append(opt);
  });
}

const tuneState = {
  weights: {},
  minimums: {},
  weightOptions: ["off", "less", "normal", "more"],
  minimumMax: 5
};
let tuneTopicsTimer = null;

function debounceSaveTuneTopics() {
  clearTimeout(tuneTopicsTimer);
  tuneTopicsTimer = setTimeout(() => {
    saveCategoryWeights().catch(() => {});
    saveCategoryMinimums().catch(() => {});
  }, 400);
}

async function saveCategoryWeights() {
  feedsStatus.textContent = "Saving topic weights...";
  const response = await fetch("/api/settings/category-weights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ weights: tuneState.weights })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    feedsStatus.textContent = `Failed: ${data.error || response.status}`;
    return;
  }
  feedsStatus.textContent = "Topic weights saved. Refreshing...";
  loadArticles().catch(() => {});
}

async function saveCategoryMinimums() {
  const response = await fetch("/api/settings/category-minimums", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minimums: tuneState.minimums })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    feedsStatus.textContent = `Failed: ${data.error || response.status}`;
  }
}

function renderTuneTopics({ weights, weightOptions, minimums, minimumMax }) {
  if (!tuneTopicsList) return;
  tuneState.weights = { ...weights };
  tuneState.minimums = { ...minimums };
  tuneState.weightOptions = weightOptions;
  tuneState.minimumMax = minimumMax;

  tuneTopicsList.innerHTML = "";
  availableCategories.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "tune-topic-row";

    const name = document.createElement("span");
    name.className = "tune-cat";
    name.textContent = cat;

    const weightSel = document.createElement("select");
    weightSel.setAttribute("aria-label", `Weight for ${cat}`);
    weightOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if ((weights[cat] || "normal") === opt) o.selected = true;
      weightSel.append(o);
    });
    weightSel.addEventListener("change", () => {
      tuneState.weights[cat] = weightSel.value;
      debounceSaveTuneTopics();
    });

    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.min = "0";
    minInput.max = String(minimumMax);
    minInput.step = "1";
    minInput.value = String(minimums[cat] != null ? minimums[cat] : 0);
    minInput.setAttribute("aria-label", `Min slots for ${cat}`);
    minInput.addEventListener("change", () => {
      let v = Math.round(Number(minInput.value));
      if (!Number.isFinite(v)) v = 0;
      v = Math.max(0, Math.min(minimumMax, v));
      minInput.value = String(v);
      tuneState.minimums[cat] = v;
      debounceSaveTuneTopics();
    });

    row.append(name, weightSel, minInput);
    tuneTopicsList.append(row);
  });
}

async function loadFeeds() {
  feedsStatus.textContent = "Loading feeds...";
  feedsList.innerHTML = "";
  try {
    const response = await fetch("/api/feeds");
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const {
      feeds = [],
      categories,
      maxTotalArticles,
      maxTotalArticlesRange,
      perFeedCap,
      perFeedCapRange,
      categoryWeights,
      categoryWeightOptions,
      categoryMinimums,
      categoryMinimumMax
    } = await response.json();
    if (Array.isArray(categories) && categories.length > 0) {
      availableCategories = categories;
    }
    populateCategorySelect(feedCategoryInput, "general");
    feedsStatus.textContent = `${feeds.length} feeds configured`;

    if (maxTotalArticlesRange) {
      maxTotalInput.min = String(maxTotalArticlesRange.min);
      maxTotalInput.max = String(maxTotalArticlesRange.max);
      maxTotalHint.textContent = `(allowed: ${maxTotalArticlesRange.min}–${maxTotalArticlesRange.max})`;
    }
    if (typeof maxTotalArticles === "number") {
      maxTotalInput.value = String(maxTotalArticles);
      maxTotalValue.textContent = String(maxTotalArticles);
    }

    if (perFeedCapRange) {
      perFeedCapInput.min = String(perFeedCapRange.min);
      perFeedCapInput.max = String(perFeedCapRange.max);
    }
    if (typeof perFeedCap === "number") {
      perFeedCapInput.value = String(perFeedCap);
      perFeedCapValue.textContent = String(perFeedCap);
    }

    renderTuneTopics({
      weights: categoryWeights || {},
      weightOptions: Array.isArray(categoryWeightOptions) && categoryWeightOptions.length
        ? categoryWeightOptions
        : ["off", "less", "normal", "more"],
      minimums: categoryMinimums || {},
      minimumMax: typeof categoryMinimumMax === "number" ? categoryMinimumMax : 5
    });

    feeds.forEach((feed) => {
      const li = document.createElement("li");
      li.className = "feed-item";

      const info = document.createElement("div");
      info.className = "feed-info";
      const label = document.createElement("span");
      label.className = "feed-label";
      label.textContent = feed.label;
      const url = document.createElement("a");
      url.className = "feed-url";
      url.href = feed.url;
      url.textContent = feed.url;
      url.target = "_blank";
      url.rel = "noopener noreferrer";
      info.append(label, url);

      const categorySelect = document.createElement("select");
      categorySelect.className = "feed-category-select";
      categorySelect.setAttribute("aria-label", `Category for ${feed.label}`);
      populateCategorySelect(categorySelect, feed.category || "general");
      categorySelect.addEventListener("change", () => updateFeedCategory(feed, categorySelect.value));

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removeFeed(feed));

      li.append(info, categorySelect, removeBtn);
      feedsList.append(li);
    });
  } catch (error) {
    console.error(error);
    feedsStatus.textContent = "Could not load feeds.";
  }
}

async function removeFeed(feed) {
  if (!confirm(`Remove "${feed.label}"?`)) return;
  feedsStatus.textContent = `Removing ${feed.label}...`;
  try {
    const response = await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Status ${response.status}`);
    }
    await loadFeeds();
    loadArticles().catch(() => {});
  } catch (error) {
    feedsStatus.textContent = `Failed to remove: ${error.message}`;
  }
}

async function updateFeedCategory(feed, category) {
  feedsStatus.textContent = `Updating category for ${feed.label}...`;
  try {
    const response = await fetch(`/api/feeds/${feed.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Status ${response.status}`);
    }
    feedsStatus.textContent = `Updated ${feed.label} → ${category}`;
    feed.category = category;
    loadArticles().catch(() => {});
  } catch (error) {
    feedsStatus.textContent = `Failed to update: ${error.message}`;
  }
}

addFeedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const label = feedLabelInput.value.trim();
  const url = feedUrlInput.value.trim();
  const category = feedCategoryInput ? feedCategoryInput.value : "general";
  if (!label || !url) return;

  feedsStatus.textContent = "Adding feed...";
  try {
    const response = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, url, category })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Status ${response.status}`);
    }
    feedLabelInput.value = "";
    feedUrlInput.value = "";
    await loadFeeds();
    loadArticles().catch(() => {});
  } catch (error) {
    feedsStatus.textContent = `Failed to add: ${error.message}`;
  }
});

manageFeedsBtn.addEventListener("click", () => {
  showFeedsView(feedsView.hidden);
});

maxTotalInput.addEventListener("input", () => {
  maxTotalValue.textContent = maxTotalInput.value;
});

maxTotalInput.addEventListener("change", async () => {
  const value = Number(maxTotalInput.value);
  if (!Number.isFinite(value)) return;

  feedsStatus.textContent = "Saving...";
  try {
    const response = await fetch("/api/settings/max-total-articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Status ${response.status}`);
    feedsStatus.textContent = `Max articles set to ${data.maxTotalArticles}. Refreshing...`;
    loadArticles().catch(() => {});
  } catch (error) {
    feedsStatus.textContent = `Failed to save: ${error.message}`;
  }
});

maxTotalForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

if (perFeedCapInput) {
  perFeedCapInput.addEventListener("input", () => {
    perFeedCapValue.textContent = perFeedCapInput.value;
  });

  perFeedCapInput.addEventListener("change", async () => {
    const value = Number(perFeedCapInput.value);
    if (!Number.isFinite(value)) return;
    feedsStatus.textContent = "Saving...";
    try {
      const response = await fetch("/api/settings/per-feed-cap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Status ${response.status}`);
      feedsStatus.textContent = `Per-feed cap set to ${data.perFeedCap}. Refreshing...`;
      loadArticles().catch(() => {});
    } catch (error) {
      feedsStatus.textContent = `Failed to save: ${error.message}`;
    }
  });
}

if (perFeedCapForm) {
  perFeedCapForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });
}

refreshNowBtn.addEventListener("click", async () => {
  refreshNowBtn.disabled = true;
  const previousText = refreshNowBtn.textContent;
  refreshNowBtn.textContent = "Refreshing...";
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    state.allArticles = data.articles || [];
    renderArticles();
  } catch (error) {
    console.error(error);
    statusLine.textContent = `Refresh failed: ${error.message}`;
  } finally {
    refreshNowBtn.disabled = false;
    refreshNowBtn.textContent = previousText;
  }
});

loadArticles().catch((error) => {
  console.error(error);
  statusLine.textContent = "Could not load feeds. Check your internet and server logs.";
});
