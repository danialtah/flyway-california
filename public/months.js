// 12-month strip logic with no page code, so it can be tested on its own.

import { MONTHS } from "./feed.js";

// "all year", "Oct-May", or "Apr-May, Aug-Sep" -> 12 true/false values, Jan
// first. A range like "Oct-May" runs past December into the next year.
export function monthsIn(text) {
  if (text === "all year") return Array(12).fill(true);
  const on = Array(12).fill(false);
  for (const part of text.split(", ")) {
    const [from, to = from] = part.split("-").map((m) => MONTHS.indexOf(m));
    if (from < 0 || to < 0) throw new Error(`Unknown months: ${text}`);
    for (let m = from; ; m = (m + 1) % 12) {
      on[m] = true;
      if (m === to) break;
    }
  }
  return on;
}

// Why a species has no months, from the notes column the pipeline writes.
const NO_SEASON = {
  "in Status and Trends, but no California range":
    "No seasonal data. California is outside this bird's normal range, so sightings here are irregular.",
  "not in Status and Trends":
    "No seasonal data. eBird Status and Trends doesn't cover this species.",
};

export function noSeasonText(species) {
  return NO_SEASON[species.notes] ?? "No seasonal data.";
}
