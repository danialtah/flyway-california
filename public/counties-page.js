// Counties page: the 58 California counties, each linking to its county page.
// Typing in the box narrows the list; Enter opens the first county left.

import { normalize, matchScore } from "./search.js";
import { $, el, showError } from "./ui.js";

const countyHref = (c) => `county.html?code=${encodeURIComponent(c.code)}`;

async function load() {
  const counties = await fetch("data/ca_counties.json").then((r) => r.json());
  const input = $("county-name");

  function matching() {
    const q = normalize(input.value);
    return q ? counties.filter((c) => matchScore(c.name, q) >= 0) : counties;
  }

  function render() {
    const shown = matching();
    $("county-list").replaceChildren(...shown.map((c) => el("li", {}, el("a", { href: countyHref(c) }, `${c.name} County`))));
    $("status").textContent = shown.length
      ? (shown.length === counties.length ? `${counties.length} counties` : `${shown.length} of ${counties.length} counties`)
      : `No California county matches "${input.value.trim()}".`;
  }

  input.addEventListener("input", render);
  $("county-filter").addEventListener("submit", (event) => {
    event.preventDefault();
    const [first] = matching();
    if (first) location.href = countyHref(first);
  });
  render();
}

load().catch((err) => {
  showError($("status"), `Couldn't load counties: ${err.message}`);
});
