// California Bird Species page (A–Z), from the Figma frame "Species list ·
// Desktop (1440)": every species on the California list, A to Z, with a jump
// bar by first letter. The search (common or scientific name), the rarity
// chips, and the season chips (the home page's seasons, plus "Here in <this
// month>") narrow the list as they change. Chip counts follow the other
// filter, so they add up to what's listed.

import { normalize } from "./search.js";
import { SEASONS, inSeason } from "./feed.js";
import { monthsIn } from "./months.js";
import { MARKERS, markerGroup, swatch } from "./map.js";
import { $, el, showError, loadSpecies, cardName, FULL_MONTHS } from "./ui.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const RARITIES = ["noTier", "Rare", "Uncommon", "Common", "escapee"];

const firstLetter = (s) => normalize(s.common_name).charAt(0).toUpperCase();

// Usually in California this month, from the Status and Trends months.
const THIS_MONTH = new Date().getMonth();
const hereNow = (s) => Boolean(s.occupied_months) && monthsIn(s.occupied_months)[THIS_MONTH];

function birdItem(s) {
  const href = `species.html?code=${encodeURIComponent(s.ebird_code)}`;
  return el("li", {}, el("a", { class: "species-row", href },
    swatch(markerGroup(s)), cardName(s.common_name, s.common_name)));
}

// A chip with no birds behind it is disabled (the filter pill's disabled
// state), unless it's the one picked.
function chip(pressed, count, onClick, ...content) {
  const button = el("button", { type: "button", class: "pill chip", "aria-pressed": String(pressed) }, ...content);
  button.disabled = !count && !pressed;
  button.addEventListener("click", onClick);
  return button;
}

async function load() {
  const all = [...(await loadSpecies()).values()]
    .sort((a, b) => a.common_name.localeCompare(b.common_name));
  $("birds-intro").textContent = `All ${all.length.toLocaleString("en-US")} species recorded in California from eBird up to today, `
    + "from backyard regulars to once-in-a-lifetime visitors. Pick one to see when it's here and where it's been seen lately.";

  let rarity = "";       // "" is All
  let season = "";      // a SEASONS value, or "now" for "Here in <month>"

  const nameMatches = (s, q) => !q || normalize(s.common_name).includes(q) || normalize(s.scientific_name ?? "").includes(q);
  const rarityMatches = (s) => !rarity || markerGroup(s) === rarity;
  const seasonOf = (value) => (s) => (value === "now" ? hereNow(s) : inSeason({ species: s }, value));
  const seasonMatches = (s) => seasonOf(season)(s);

  function drawChips() {
    const inSeason = all.filter(seasonMatches);
    const text = (n) => n.toLocaleString("en-US");
    const groupCount = (group) => inSeason.filter((s) => markerGroup(s) === group).length;
    const seasonCount = (value) => all.filter((s) => rarityMatches(s) && seasonOf(value)(s)).length;
    $("rarity").replaceChildren(
      chip(!rarity, inSeason.length, () => { rarity = ""; render(); }, `All · ${text(inSeason.length)}`),
      ...RARITIES.map((group) => chip(rarity === group, groupCount(group), () => { rarity = rarity === group ? "" : group; render(); },
        swatch(group), `${MARKERS[group].label} · ${text(groupCount(group))}`)));
    const seasons = [...SEASONS, { value: "now", text: `Here in ${FULL_MONTHS[THIS_MONTH]}` }];
    $("season").replaceChildren(...seasons.map(({ value, text: label }) =>
      chip(season === value, seasonCount(value), () => { season = season === value ? "" : value; render(); },
        `${label} · ${text(seasonCount(value))}`)));
  }

  function render() {
    const q = normalize($("bird-name").value);
    const shown = all.filter((s) => nameMatches(s, q) && rarityMatches(s) && seasonMatches(s));
    const byLetter = new Map();
    for (const s of shown) {
      const letter = firstLetter(s);
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter).push(s);
    }
    drawChips();
    $("status").textContent = shown.length ? "" : "No birds match your search and filters.";
    $("letters").replaceChildren(...LETTERS.map((letter) => (byLetter.has(letter)
      ? el("a", { href: `#letter-${letter}` }, letter)
      : el("span", { class: "none", "aria-hidden": "true" }, letter))));
    $("bird-list").replaceChildren(...[...byLetter].map(([letter, birds]) =>
      el("section", { class: "letter-section", "aria-labelledby": `letter-${letter}` },
        el("h2", { id: `letter-${letter}` }, letter),
        el("ul", {}, ...birds.map(birdItem)))));
  }

  $("bird-name").addEventListener("input", render);
  $("bird-filter").addEventListener("submit", (event) => {
    event.preventDefault();
    $("bird-list").querySelector("a")?.click();  // Enter opens the first bird left
  });
  render();
}

load().catch((err) => {
  showError($("status"), `Couldn't load birds: ${err.message}`);
});
