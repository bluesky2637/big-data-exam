(() => {
  const search = document.querySelector("#paper-search");
  const chips = [...document.querySelectorAll(".filter-chip")];
  const cards = [...document.querySelectorAll(".paper-card")];
  const empty = document.querySelector("#empty-state");
  let activeFilter = "全部";

  function addChallengeLinks() {
    cards.forEach((card) => {
      if (card.dataset.category !== "大数据") return;
      const startLink = card.querySelector(".card-link");
      if (!startLink || card.querySelector(".challenge-link")) return;
      const paperHref = startLink.getAttribute("href");
      const wrapper = document.createElement("div");
      wrapper.className = "card-link-group";
      wrapper.style.display = "grid";
      wrapper.style.gap = "10px";
      startLink.parentNode.insertBefore(wrapper, startLink);
      wrapper.appendChild(startLink);

      const challengeLink = document.createElement("a");
      challengeLink.className = "card-link challenge-link";
      challengeLink.href = `challenge.html?paper=${encodeURIComponent(paperHref)}`;
      challengeLink.setAttribute("aria-label", `20题闯关：${card.querySelector("h2")?.textContent || "试卷"}`);
      challengeLink.innerHTML = "20题闯关 <span>↗</span>";
      challengeLink.style.background = "var(--green)";
      wrapper.appendChild(challengeLink);
    });
  }

  function applyFilters() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const categoryMatch = activeFilter === "全部" || card.dataset.category === activeFilter;
      const searchMatch = !query || card.dataset.search.includes(query);
      const show = categoryMatch && searchMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });
    empty.hidden = visible !== 0;
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      activeFilter = chip.dataset.filter;
      chips.forEach((item) => item.classList.toggle("active", item === chip));
      applyFilters();
    });
  });

  search.addEventListener("input", applyFilters);
  addChallengeLinks();
})();
