# Rarity metrics v2: expanded California mask and a max-cell metric.
#
# Usage:
#   Rscript compute_rarity_check_v2.R   # -> ca_species_rarity_check_v2.csv
#
# The expanded mask is the Census cartographic boundary for California
# (includes the Channel Islands) plus a 20 km offshore strip, with any part
# of the strip that falls on neighbouring land removed. Uses the weekly 27 km
# occurrence files already downloaded; only the boundary file is fetched.

suppressPackageStartupMessages({
  library(ebirdst)
  library(terra)
  library(sf)
  library(maps)
})

OFFSHORE_KM <- 20

data_dir <- file.path(ebirdst_data_dir(), "2023")
bnd_dir <- file.path(ebirdst_data_dir(), "boundaries")
bnd_zip <- file.path(bnd_dir, "cb_2023_us_state_5m.zip")
if (!file.exists(bnd_zip)) {
  dir.create(bnd_dir, showWarnings = FALSE)
  download.file("https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_5m.zip",
                bnd_zip, quiet = TRUE)
}
unzip(bnd_zip, exdir = file.path(bnd_dir, "cb_2023_us_state_5m"))
states <- st_read(file.path(bnd_dir, "cb_2023_us_state_5m", "cb_2023_us_state_5m.shp"), quiet = TRUE)

# work in an equal-area projection so the buffer is in metres
aea <- "EPSG:3310"  # California Albers
ca <- st_union(st_transform(states[states$STUSPS == "CA", ], aea))
neighbours <- st_union(st_transform(states[states$STUSPS %in% c("OR", "NV", "AZ"), ], aea))
mexico <- st_union(st_transform(st_make_valid(st_as_sf(
  maps::map("world", "Mexico", plot = FALSE, fill = TRUE))), aea))
expanded <- st_buffer(ca, OFFSHORE_KM * 1000)
expanded <- st_difference(st_difference(expanded, neighbours), mexico)
expanded <- st_union(expanded, ca)

old_mask <- st_as_sf(maps::map("state", "california", plot = FALSE, fill = TRUE))

monthly <- function(wk, dates) {
  as.vector(tapply(wk, factor(as.integer(format(dates, "%m")), levels = 1:12), mean))
}

metrics <- function(code) {
  out <- c(peak_ca_occurrence_expanded = NA_real_, peak_max_cell_occurrence = NA_real_)
  tif <- list.files(file.path(data_dir, code), pattern = "_occurrence_median_27km_.*\\.tif$",
                    recursive = TRUE, full.names = TRUE)
  if (length(tif) == 0) return(out)
  r <- rast(tif[1])
  m <- mask(crop(r, vect(st_transform(expanded, crs(r)))), vect(st_transform(expanded, crs(r))))
  avg <- global(m, "mean", na.rm = TRUE)$mean
  mon <- monthly(avg, as.Date(names(r)))
  if (all(is.na(mon))) return(out)
  # peak week = week with the highest CA-averaged occurrence
  peak_week <- which.max(avg)
  c(peak_ca_occurrence_expanded = max(mon, na.rm = TRUE),
    peak_max_cell_occurrence = global(m[[peak_week]], "max", na.rm = TRUE)$max)
}

prev <- read.csv("ca_species_rarity_check.csv")
res <- t(vapply(prev$ebird_code, function(code) {
  message(code)
  tryCatch(metrics(code), error = function(e) c(NA_real_, NA_real_))
}, numeric(2)))
out <- cbind(prev, res)
rownames(out) <- NULL

write.csv(out, "ca_species_rarity_check_v2.csv", row.names = FALSE)
message(nrow(out), " species written to ca_species_rarity_check_v2.csv")
