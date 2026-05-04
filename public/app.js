const state = {
  allArticles: [],
  selectedFilter: "all"
};

const articleContainer = document.getElementById("articles");
const statusLine = document.getElementById("statusLine");
const template = document.getElementById("articleTemplate");

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

loadArticles().catch((error) => {
  console.error(error);
  statusLine.textContent = "Could not load feeds. Check your internet and server logs.";
});
