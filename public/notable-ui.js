// Notable sightings sections shared by the home page and the county pages:
// the rarest list items, map popups, the rare bird hotspots, and the tier
// cards. Each page loads its own sightings and calls these to draw them.

import { firstSentence, formatDate, placeText } from "./feed.js";
import { $, el, speciesLink, badges, cardName } from "./ui.js";
import { MARKERS, markerGroup, swatch, openPin, groupByPlace, topHotspots } from "./map.js";

// How a time window reads in headings ("Rarest Birds in California This
// Week") and in sentences ("None this week").
export function period(days) {
  return days === 7
    ? { days, heading: "This Week", span: "this week" }
    : { days, heading: `in the Last ${days} Days`, span: `in the last ${days} days` };
}

export function topItem(group) {
  return el("li", {},
    cardName(speciesLink(group), group.comName), ...badges(group),
    el("div", {}, group.counties.join(", ")),
    el("div", {}, firstSentence(group.species.status_line)));
}

function placesText(group) {
  return group.placeCount === 1 ? "seen at 1 place" : `seen at ${group.placeCount} places`;
}

function feedItem(group) {
  return el("li", {},
    speciesLink(group), ...badges(group),
    el("div", {}, `${placeText(group.latest)} · ${formatDate(group.latest.date)} · ${placesText(group)}`));
}

// Map popup for one place: its name and county, then each bird seen there.
function placePopup(place) {
  return el("div", {},
    el("strong", {}, place.locName),
    el("div", {}, `${place.county} County`),
    el("ul", {}, ...place.birds.map(({ bird, sighting }) =>
      el("li", {}, speciesLink(bird), ...badges(bird), ` · ${formatDate(sighting.date)}`))));
}

// groupBySpecies groups -> map places, each with its popup.
export function placesFor(groups) {
  return groupByPlace(groups).map((place) => ({ ...place, popup: placePopup(place) }));
}

export function fillList(list, items, emptyText) {
  list.replaceChildren(...(items.length ? items : [el("li", {}, emptyText)]));
}

// One hotspot: its name, county, and rare birds, and a button that shows it
// on the map.
function hotspotItem(mapParts, { place, rare }) {
  const show = el("button", { type: "button" }, "Show on map");
  show.addEventListener("click", () => {
    openPin(mapParts, place);
    $("map").scrollIntoView({ behavior: "smooth" });
  });
  return el("li", {},
    el("strong", {}, cardName(place.locName, place.locName)),
    el("div", {}, `${place.county} County`),
    el("div", {}, `${rare.length} rare birds · ${place.birds.length} notable birds in all`),
    el("div", {}, ...rare.flatMap(({ bird }, i) => [i ? ", " : "", speciesLink(bird)])),
    show);
}

// The hotspots section hides when fewer than 2 places qualify: one place
// isn't a ranking.
export function showHotspots(mapParts, places, where, when, count) {
  const hotspots = topHotspots(places, count);
  $("hotspots-section").hidden = hotspots.length < 2;
  $("hotspots-heading").textContent = `Rare Bird Hotspots ${where.phrase} ${when.heading}`;
  $("hotspots").replaceChildren(...hotspots.map((h) => hotspotItem(mapParts, h)));
}

// Tier cards: the notable birds split by map marker, rarest first. Opening a
// card lists its birds below the cards, LIST_STEP at a time. Hybrids have no
// species row or tier; they're crosses of native birds and mostly turn up
// every year, so they go with Common, as on the map.
const CARDS = [
  { group: "noTier", label: MARKERS.noTier.label },
  { group: "Rare", label: MARKERS.Rare.label },
  { group: "Uncommon", label: MARKERS.Uncommon.label },
  { group: "Common", label: MARKERS.Common.label },
  { group: "escapee", label: MARKERS.escapee.label },
];
const LIST_STEP = 25;

const cardGroup = (bird) => (bird.species ? markerGroup(bird.species) : "Common");
const isReview = (bird) => bird.species?.cbrc_review === "true";
const sightingsText = (n) => (n === 1 ? "1 sighting" : `${n} sightings`);

// Returns a function that redraws the cards for a new set of birds and time
// window. The open card stays open unless it has no birds left.
export function setUpTiers() {
  let tiers = new Map();
  let when = period(7);
  let open = null;
  let shown = LIST_STEP;

  function card({ group, label }) {
    const birds = tiers.get(group);
    const sightings = birds.reduce((n, b) => n + b.sightings.length, 0);
    const button = el("button", { type: "button", "aria-expanded": String(group === open), "aria-controls": "tier-list" },
      swatch(group), el("strong", {}, label),
      el("span", {}, birds.length ? ` · ${birds.length} species · ${sightingsText(sightings)}` : ` · None ${when.span}`),
      birds.length ? el("span", {}, ` · ${birds.slice(0, 3).map((b) => b.comName).join(", ")}`) : null);
    button.disabled = !birds.length;
    button.addEventListener("click", () => {
      open = group === open ? null : group;
      shown = LIST_STEP;
      render();
    });
    return el("li", {}, button);
  }

  function render() {
    $("tier-cards").replaceChildren(...CARDS.map(card));
    const list = $("tier-list");
    list.hidden = !open;
    if (!open) return list.replaceChildren();
    const birds = tiers.get(open);
    const left = birds.length - shown;
    const more = el("button", { type: "button" }, `Show ${Math.min(left, LIST_STEP)} more`);
    more.addEventListener("click", () => { shown += LIST_STEP; render(); });
    list.replaceChildren(
      el("h3", {}, `${CARDS.find((c) => c.group === open).label} · ${birds.length} species`),
      el("ul", {}, ...birds.slice(0, shown).map(feedItem)),
      ...(left > 0 ? [more] : []));
  }

  return (groups, newWhen = period(7)) => {
    when = newWhen;
    tiers = new Map(CARDS.map(({ group }) => [group, []]));
    for (const g of groups) tiers.get(cardGroup(g)).push(g);
    // CBRC review species first, then newest sighting first (groups come newest first).
    for (const [group, birds] of tiers) tiers.set(group, [...birds.filter(isReview), ...birds.filter((b) => !isReview(b))]);
    if (open && !tiers.get(open).length) open = null;
    shown = LIST_STEP;
    render();
  };
}
