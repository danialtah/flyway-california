# Peak California occurrence per species, for setting rarity tiers.
#
# Usage:
#   Rscript compute_rarity_check.R   # -> ca_species_rarity_check.csv
#
# Uses the weekly 27 km occurrence files already downloaded by
# classify_ca_status.R; nothing is downloaded here.

suppressPackageStartupMessages({
  library(ebirdst)
  library(terra)
  library(sf)
  library(maps)
})

ca_boundary <- st_as_sf(maps::map("state", "california", plot = FALSE, fill = TRUE))
data_dir <- file.path(ebirdst_data_dir(), "2023")

# highest monthly value of the CA-averaged weekly occurrence
peak_occurrence <- function(code) {
  tif <- list.files(file.path(data_dir, code), pattern = "_occurrence_median_27km_.*\\.tif$",
                    recursive = TRUE, full.names = TRUE)
  if (length(tif) == 0) return(NA_real_)
  r <- rast(tif[1])
  cav <- vect(st_transform(ca_boundary, crs(r)))
  wk <- global(mask(crop(r, cav), cav), "mean", na.rm = TRUE)$mean
  mon <- tapply(wk, factor(as.integer(format(as.Date(names(r)), "%m")), levels = 1:12), mean)
  if (all(is.na(mon))) NA_real_ else max(mon, na.rm = TRUE)
}

sp <- read.csv("ca_species_all.csv")
sp$peak_ca_occurrence <- vapply(sp$ebird_code, function(code) {
  message(code)
  tryCatch(peak_occurrence(code), error = function(e) NA_real_)
}, numeric(1))

write.csv(sp[, c("ebird_code", "common_name", "peak_ca_occurrence")],
          "ca_species_rarity_check.csv", row.names = FALSE)
message(sum(!is.na(sp$peak_ca_occurrence)), " species with occurrence data written to ca_species_rarity_check.csv")
