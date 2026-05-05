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
const maxItemsForm = document.getElementById("maxItemsForm");
const maxItemsInput = document.getElementById("maxItemsInput");
const maxItemsHint = document.getElementById("maxItemsHint");
const maxTotalForm = document.getElementById("maxTotalForm");
const maxTotalInput = document.getElementById("maxTotalInput");
const maxTotalHint = document.getElementById("maxTotalHint");

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function renderArticles() {
  articleContainer.innerHTML = "";

  const visible = state.selectedFilter === "all"
    ? state.allArticles
    : state.allArticles.filter((article) => article.category === state.selectedFilter);

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

async function loadFeeds() {
  feedsStatus.textContent = "Loading feeds...";
  feedsList.innerHTML = "";
  try {
    const response = await fetch("/api/feeds");
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const { feeds = [], maxItemsPerFeed, maxItemsPerFeedRange, maxTotalArticles, maxTotalArticlesRange } = await response.json();
    feedsStatus.textContent = `${feeds.length} feeds configured`;

    if (typeof maxItemsPerFeed === "number") {
      maxItemsInput.value = String(maxItemsPerFeed);
    }
    if (maxItemsPerFeedRange) {
      maxItemsInput.min = String(maxItemsPerFeedRange.min);
      maxItemsInput.max = String(maxItemsPerFeedRange.max);
      maxItemsHint.textContent = `(allowed: ${maxItemsPerFeedRange.min}–${maxItemsPerFeedRange.max})`;
    }
    if (typeof maxTotalArticles === "number") {
      maxTotalInput.value = String(maxTotalArticles);
    }
    if (maxTotalArticlesRange) {
      maxTotalInput.min = String(maxTotalArticlesRange.min);
      maxTotalInput.max = String(maxTotalArticlesRange.max);
      maxTotalHint.textContent = `(allowed: ${maxTotalArticlesRange.min}–${maxTotalArticlesRange.max})`;
    }

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

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removeFeed(feed));

      li.append(info, removeBtn);
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

addFeedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const label = feedLabelInput.value.trim();
  const url = feedUrlInput.value.trim();
  if (!label || !url) return;

  feedsStatus.textContent = "Adding feed...";
  try {
    const response = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, url })
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

maxItemsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = Number(maxItemsInput.value);
  if (!Number.isFinite(value)) return;

  feedsStatus.textContent = "Saving...";
  try {
    const response = await fetch("/api/settings/max-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Status ${response.status}`);
    feedsStatus.textContent = `Max items per feed set to ${data.maxItemsPerFeed}. Refreshing...`;
    loadArticles().catch(() => {});
  } catch (error) {
    feedsStatus.textContent = `Failed to save: ${error.message}`;
  }
});

maxTotalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
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
    feedsStatus.textContent = `Max total articles set to ${data.maxTotalArticles}. Refreshing...`;
    loadArticles().catch(() => {});
  } catch (error) {
    feedsStatus.textContent = `Failed to save: ${error.message}`;
  }
});

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
