(() => {
  const search = document.querySelector("#paper-search");
  const chips = [...document.querySelectorAll(".filter-chip")];
  const cards = [...document.querySelectorAll(".paper-card")];
  const empty = document.querySelector("#empty-state");
  let activeFilter = "全部";

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
})();
