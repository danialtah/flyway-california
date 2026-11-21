// California Bird Species page: every species on the California list, A to Z
// with jump links by first letter. The name box and the rarity, season,
// and CBRC review filters narrow the list as they change.

import { normalize } from "./search.js";
import { inSeason } from "./feed.js";
import { $, el, showError, speciesLink, badges, loadSpecies } from "./ui.js";
import { markerGroup } from "./map.js";

const firstLetter = (s) => normalize(s.common_name).charAt(0).toUpperCase();

function birdItem(s) {
  const group = { species: s, comName: s.common_name };
  return el("li", {}, speciesLink(group), ...badges(group), " · ", el("i", {}, s.scientific_name ?? ""));
}

async function load() {
  const all = [...(await loadSpecies()).values()]
    .sort((a, b) => a.common_name.localeCompare(b.common_name));

  function matching() {
    const q = normalize($("bird-name").value);
    const rarity = $("bird-rarity").value;
    const season = $("bird-season").value;
    const reviewOnly = $("bird-review").checked;
    return all.filter((s) =>
      (!q || normalize(s.common_name).includes(q) || normalize(s.scientific_name ?? "").includes(q)) &&
      (!rarity || markerGroup(s) === rarity) &&
      inSeason({ species: s }, season) &&
      (!reviewOnly || s.cbrc_review === "true"));
  }

  function render() {
    const shown = matching();
    const byLetter = new Map();
    for (const s of shown) {
      const letter = firstLetter(s);
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(s);
    }
    $("status").textContent = shown.length === all.length
      ? `${all.length} species`
      : shown.length ? `${shown.length} of ${all.length} species` : "No birds match these filters.";
    $("letters").replaceChildren(...[...byLetter.keys()].flatMap((letter, i) =>
      [i ? " " : "", el("a", { href: `#letter-${letter}` }, letter)]));
    $("bird-list").replaceChildren(...[...byLetter].map(([letter, birds]) =>
      el("section", {}, el("h2", { id: `letter-${letter}` }, letter), el("ul", {}, ...birds.map(birdItem)))));
  }

  $("bird-filter").addEventListener("input", render);
  $("bird-filter").addEventListener("submit", (event) => event.preventDefault());
  render();
}

load().catch((err) => {
  showError($("status"), `Couldn't load birds: ${err.message}`);
});
