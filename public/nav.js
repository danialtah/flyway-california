// Site search in the header of every page. As the visitor types, it suggests
// the best few birds, counties, and eBird hotspots (from /api/suggest).
// Picking a bird or county opens its page; picking a place opens the home
// page near it. Enter opens the first suggestion, or, with none, looks the
// text up as a place on the home page (?place=), like the near-me search.

import { normalize, suggestions } from "./search.js";
import { $, el, loadSpecies } from "./ui.js";

const DELAY_MS = 150;     // wait for a pause in typing
const PLACE_MIN = 3;      // characters typed before asking the server for places

// Birds and counties load the first time the search is used.
let lists = null;
function loadLists() {
  lists ??= Promise.all([loadSpecies(), fetch("data/ca_counties.json").then((r) => r.json())])
    .then(([species, counties]) => ({ species, counties }));
  return lists;
}

// normalized query -> promise of places; a failed lookup just has no places.
const placeCache = new Map();
function placesFor(q) {
  if (normalize(q).length < PLACE_MIN) return Promise.resolve([]);
  const key = normalize(q);
  if (!placeCache.has(key)) {
    placeCache.set(key, fetch(`/api/suggest?${new URLSearchParams({ q })}`)
      .then((r) => r.json())
      .then((data) => data.places ?? [])
      .catch(() => []));
  }
  return placeCache.get(key);
}

function href(hit) {
  if (hit.kind === "bird") return `species.html?code=${encodeURIComponent(hit.item.ebird_code)}`;
  if (hit.kind === "county") return `county.html?code=${encodeURIComponent(hit.item.code)}`;
  const { name, lat, lng } = hit.item;
  return `./?${new URLSearchParams({ lat, lng, name })}`;
}

function detail(hit, counties) {
  if (hit.kind === "bird") return "Bird";
  if (hit.kind === "county") return "County";
  const county = counties.find((c) => c.code === hit.item.countyCode);
  return county ? `Place · ${county.name} County` : "Place";
}

function setUpSearch() {
  const form = $("site-search");
  if (!form) return;
  const input = $("site-search-input");
  const list = $("site-search-list");
  let hits = [];
  let active = -1;
  let timer = null;

  function close() {
    hits = [];
    active = -1;
    list.replaceChildren();
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function render(counties) {
    if (!hits.length) return close();
    list.replaceChildren(...hits.map((hit, i) => {
      const option = el("li", { id: `site-search-option-${i}`, role: "option", "aria-selected": String(i === active) },
        el("span", {}, hit.name), el("span", {}, ` · ${detail(hit, counties)}`));
      option.addEventListener("mousedown", (event) => event.preventDefault());  // keep focus in the input
      option.addEventListener("click", () => { location.href = href(hit); });
      return option;
    }));
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (active >= 0) input.setAttribute("aria-activedescendant", `site-search-option-${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  // Show birds and counties right away, then again with places when they come.
  async function update() {
    const q = input.value.trim();
    const { species, counties } = await loadLists();
    if (input.value.trim() !== q) return;
    active = -1;
    hits = suggestions(q, species, counties);
    render(counties);
    const places = await placesFor(q);
    if (!places.length || input.value.trim() !== q) return;
    hits = suggestions(q, species, counties, places);
    render(counties);
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(update, DELAY_MS);
  });

  input.addEventListener("keydown", async (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!hits.length) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // Positions 0..n, where 0 is the input itself (active -1).
      const slots = hits.length + 1;
      active = ((active + 1 + step) % slots + slots) % slots - 1;
      render((await loadLists()).counties);
    } else if (event.key === "Escape") {
      close();
    }
  });

  input.addEventListener("blur", close);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    if (active >= 0) {
      location.href = href(hits[active]);
      return;
    }
    const { species, counties } = await loadLists();
    const [first] = suggestions(q, species, counties, await placesFor(q));
    location.href = first ? href(first) : `./?${new URLSearchParams({ place: q })}`;
  });
}

setUpSearch();
