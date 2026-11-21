# Proposed v4 classification: month-based migration types on the expanded
# California outline (Census boundary with the Channel Islands, plus a 20 km
# offshore strip). Summer is June and July only. A review_flag column marks
# species whose month-based type differs from eBird's seasonal type.
# v4 adds pre-split stand-in data for six eBird splits, notes for the condor
# and escapees, and the CBRC columns from ca_species_reference_v2.csv.
# v5 makes Northern Yellow Warbler a summer visitor and keeps rule-based notes
# (such as the small-share note) alongside the escapee notes.
#
# Usage:
#   Rscript classify_ca_status_v5.R   # -> ca_species_status.csv (the official file)
#
# Uses the Status and Trends files already downloaded by classify_ca_status.R;
# stand-in species are downloaded here if missing.

suppressPackageStartupMessages({
  library(ebirdst)
  library(terra)
  library(sf)
  library(maps)
})

OUT_FILE <- "ca_species_status.csv"
REFERENCE_FILE <- "ca_species_reference_v2.csv"
if (file.exists(OUT_FILE)) stop(OUT_FILE, " already exists; not overwriting")

# A month counts as occupied when it reaches this share of the species' own
# California peak month.
OCCUPIED_SHARE <- 0.25
# Winter: at least 2 of Dec, Jan, Feb. Summer: both Jun and Jul (August is
# left out because fall migration has started by then).
WINTER <- c(12, 1, 2)
WINTER_MIN_MONTHS <- 2
SUMMER <- c(6, 7)
SUMMER_MIN_MONTHS <- 2
OFFSHORE_KM <- 20

RARE_POP_SHARE <- 0.001
RARE_NOTE <- "small share of global population"
MISMATCH_NOTE <- "statewide average may not match coast or interior pattern"
NO_MONTHS_NOTE <- "no California occurrence in weekly data"

# eBird splits not modeled in Status and Trends 2023: eBird code -> pre-split
# Status and Trends code used as a stand-in.
STAND_IN <- c(
  yelwar1 = "yelwar",   # Northern Yellow Warbler <- Yellow Warbler
  marwre1 = "marwre",   # Western Marsh Wren <- Marsh Wren
  houwre  = "y01309",   # Northern House Wren <- Northern/Southern House Wren
  wewvir2 = "warvir",   # Western Warbling Vireo <- Warbling Vireo
  willet3 = "willet1",  # Prairie Willet <- Willet
  whimbr3 = "whimbr"    # Hudsonian Whimbrel <- Whimbrel
)
STAND_IN_NOTE <- "pre-split Status and Trends data; eBird split not modeled"

# Manual exceptions applied after the rules. A missing migration_type keeps
# the type the data gives. `notes` replaces the rule-based notes; `add_notes`
# goes in front of them.
ESCAPEE_NOTE <- "escapee found in California; may have settled here"
escapee <- list(add_notes = ESCAPEE_NOTE)
OVERRIDES <- list(
  comloo = list(migration_type = "year-round",
                notes = "Status and Trends shows a winter-visitor pattern"),
  calcon = list(migration_type = "year-round",
                notes = "native; recovered from near extinction; reintroduced populations"),
  yelwar1 = list(migration_type = "summer visitor"),  # Northern Yellow Warbler: breeds here
  mutswa = list(migration_type = "year-round",
                add_notes = "escapee established in very small numbers"),
  bucpar = escapee,   # Blue-crowned Parakeet
  burpar = escapee,   # Burrowing Parakeet
  monpar = escapee,   # Monk Parakeet
  rorpar = escapee,   # Rose-ringed Parakeet
  yehpar = escapee,   # Yellow-headed Amazon
  egygoo = escapee,   # Egyptian Goose
  compea = escapee,   # Indian Peafowl
  orabis1 = escapee,  # Northern Red Bishop
  eutspa = escapee    # Eurasian Tree Sparrow
)

# expanded California outline
data_dir <- file.path(ebirdst_data_dir(), "2023")
bnd_dir <- file.path(ebirdst_data_dir(), "boundaries", "cb_2023_us_state_5m")
states <- st_read(file.path(bnd_dir, "cb_2023_us_state_5m.shp"), quiet = TRUE)
aea <- "EPSG:3310"  # California Albers, metres
ca <- st_union(st_transform(states[states$STUSPS == "CA", ], aea))
neighbours <- st_union(st_transform(states[states$STUSPS %in% c("OR", "NV", "AZ"), ], aea))
mexico <- st_union(st_transform(st_make_valid(st_as_sf(
  maps::map("world", "Mexico", plot = FALSE, fill = TRUE))), aea))
expanded <- st_buffer(ca, OFFSHORE_KM * 1000)
expanded <- st_union(st_difference(st_difference(expanded, neighbours), mexico), ca)

format_months <- function(occ) {
  if (all(occ)) return("all year")
  if (!any(occ)) return("")
  # start runs right after an unoccupied month so ranges can wrap Dec -> Jan
  start <- which(!occ)[1] %% 12 + 1
  idx <- ((start - 1 + 0:11) %% 12) + 1
  runs <- rle(occ[idx])
  ends <- cumsum(runs$lengths)
  out <- character()
  for (i in seq_along(runs$values)) {
    if (!runs$values[i]) next
    a <- month.abb[idx[ends[i] - runs$lengths[i] + 1]]
    b <- month.abb[idx[ends[i]]]
    out <- c(out, if (a == b) a else paste0(a, "-", b))
  }
  paste(out, collapse = ", ")
}

in_winter <- function(occ) sum(occ[WINTER]) >= WINTER_MIN_MONTHS
in_summer <- function(occ) sum(occ[SUMMER]) >= SUMMER_MIN_MONTHS

# eBird's seasonal type: the original rules applied to California seasonal
# abundance from regional_stats.csv (a season counts at 25% of the peak season).
seasonal_type <- function(ca_rows) {
  if ("resident" %in% ca_rows$season) return("year-round")
  ab <- setNames(ca_rows$abundance_mean, ca_rows$season)
  occ <- ab >= OCCUPIED_SHARE * max(ab, na.rm = TRUE)
  occ[is.na(occ)] <- FALSE
  has <- function(s) s %in% names(occ) && occ[[s]]
  if (has("breeding") && has("nonbreeding")) "year-round"
  else if (has("nonbreeding")) "winter visitor"
  else if (!has("breeding") &&
           (has("prebreeding_migration") || has("postbreeding_migration"))) "migrant"
  else if (has("breeding")) "summer visitor"
  else NA_character_
}

# rule order: year-round, winter visitor, migrant, summer visitor
type_from_months <- function(occ) {
  if (in_winter(occ) && in_summer(occ)) "year-round"
  else if (in_winter(occ)) "winter visitor"
  else if (!in_summer(occ)) "migrant"
  else "summer visitor"
}

# Months that contradict the type, using the same season tests as the type.
months_mismatch <- function(type, occ) {
  switch(type,
    "year-round"     = !(in_winter(occ) && in_summer(occ)),
    "winter visitor" = !in_winter(occ),
    "summer visitor" = !in_summer(occ) || in_winter(occ),
    "migrant"        = in_winter(occ) || in_summer(occ),
    FALSE)
}

classify <- function(code, common_name) {
  row <- function(type, months = "", notes = character(), review_flag = "") {
    o <- OVERRIDES[[code]]
    if (!is.null(o)) {
      if (!is.null(o$migration_type)) type <- o$migration_type
      if (!is.null(o$notes)) notes <- o$notes
      if (!is.null(o$add_notes)) notes <- c(o$add_notes, notes)
    }
    data.frame(ebird_code = code, common_name = common_name, migration_type = type,
               occupied_months = months, notes = paste(notes, collapse = "; "),
               review_flag = review_flag)
  }

  notes <- character()
  st_code <- code
  if (code %in% names(STAND_IN)) {
    st_code <- STAND_IN[[code]]
    notes <- STAND_IN_NOTE
    if (!dir.exists(file.path(data_dir, st_code))) {
      ebirdst_download_status(st_code, download_abundance = FALSE,
                              download_regional = TRUE, download_occurrence = TRUE,
                              pattern = "regional_stats|_occurrence_median_27km_")
    }
  }
  if (!st_code %in% ebirdst_runs$species_code) return(row("no data", notes = "not in Status and Trends"))
  path <- file.path(data_dir, st_code)
  rs_file <- file.path(path, "regional_stats.csv")
  rs <- if (file.exists(rs_file)) read.csv(rs_file) else data.frame()
  ca_rows <- rs[rs$region_code %in% "USA-CA", ]
  if (nrow(ca_rows) == 0) {
    return(row("no data", notes = "in Status and Trends, but no California range"))
  }

  tif <- list.files(path, pattern = "_occurrence_median_27km_.*\\.tif$",
                    recursive = TRUE, full.names = TRUE)
  if (length(tif) == 0) return(row("no data", notes = "no weekly occurrence data"))
  r <- rast(tif[1])
  cav <- vect(st_transform(expanded, crs(r)))
  wk <- global(mask(crop(r, cav), cav), "mean", na.rm = TRUE)$mean
  mon <- as.vector(tapply(wk, factor(as.integer(format(as.Date(names(r)), "%m")), levels = 1:12), mean))
  peak <- max(mon, na.rm = TRUE)
  # all-zero months mean no months occupied, not all months
  occ <- if (is.finite(peak) && peak > 0) mon >= OCCUPIED_SHARE * peak else rep(FALSE, 12)
  occ[is.na(occ)] <- FALSE
  if ("resident" %in% ca_rows$season) occ[] <- TRUE

  if (!any(occ)) return(row("no data", notes = NO_MONTHS_NOTE))
  type <- type_from_months(occ)
  if (months_mismatch(type, occ)) notes <- c(notes, MISMATCH_NOTE)
  if (max(ca_rows$total_pop_percent, na.rm = TRUE) < RARE_POP_SHARE) notes <- c(notes, RARE_NOTE)

  # flag only; the month-based type is kept
  st <- seasonal_type(ca_rows)
  flag <- if (!is.na(st) && st != type) {
    sprintf("month: %s; eBird seasonal: %s", type, st)
  } else ""
  row(type, format_months(occ), notes, flag)
}

sp <- read.csv("ca_species_all.csv")
out <- do.call(rbind, Map(function(code, name) {
  message(code)
  tryCatch(classify(code, name),
           error = function(e) data.frame(ebird_code = code, common_name = name,
                                          migration_type = "no data", occupied_months = "",
                                          notes = paste("error:", conditionMessage(e)),
                                          review_flag = ""))
}, sp$ebird_code, sp$common_name))
ref <- read.csv(REFERENCE_FILE)
out <- cbind(out, ref[match(out$ebird_code, ref$ebird_code), c("cbrc_list", "cbrc_review")])
write.csv(out, OUT_FILE, row.names = FALSE)
message(nrow(out), " species written to ", OUT_FILE)
