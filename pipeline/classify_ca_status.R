# Download Status and Trends data for California species, and classify them
# with the first-draft rules (seasonal types on the land-only outline).
# The official ca_species_status.csv is built by classify_ca_status_v5.R;
# this script never writes it.
#
# Usage:
#   Rscript classify_ca_status.R                    # full list: download only
#   Rscript classify_ca_status.R comloo brant ...   # test codes -> printed only
# Options:
#   --shares=0.2,0.25,0.3   occupied cutoffs to compare (default 0.25)
#   --out=DIR               also write first-draft ca_species_status_<share>.csv
#                           files to DIR
#
# Reads the access key from EBIRDST_KEY (~/.Renviron). Raw downloads stay in
# ebirdst_data_dir(); only the CSV is written to the project folder.

suppressPackageStartupMessages({
  library(ebirdst)
  library(terra)
  library(sf)
  library(maps)
})

# A season or month counts as occupied when it reaches this share of the
# species' own California peak.
OCCUPIED_SHARE <- 0.25
# Below this share of the global population in every season, a species is
# noted as rare in California (it is still classified).
RARE_POP_SHARE <- 0.001
RARE_NOTE <- "rare in California (under 0.1% of population)"
MISMATCH_NOTE <- "statewide average may not match coast or interior pattern"

# Manual exceptions applied after the rules.
OVERRIDES <- list(
  comloo = list(migration_type = "year-round",
                notes = "Status and Trends shows a winter-visitor pattern")
)

ca_boundary <- st_as_sf(maps::map("state", "california", plot = FALSE, fill = TRUE))

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

# Fallback: months from range-wide season dates in ebirdst_runs.
months_from_runs <- function(run, seasons) {
  occ <- rep(FALSE, 12)
  for (s in seasons) {
    st <- run[[paste0(s, "_start")]]
    en <- run[[paste0(s, "_end")]]
    if (is.na(st) || is.na(en)) next
    days <- if (en >= st) seq(st, en, by = "day") else
      c(seq(st, as.Date(format(st, "%Y-12-31")), by = "day"),
        seq(as.Date(format(en, "%Y-01-01")), en, by = "day"))
    occ[unique(as.integer(format(days, "%m")))] <- TRUE
  }
  occ
}

# Download and summarise one species for California. Returns either
# list(no_data = "<reason>") or the inputs the rules need.
load_species <- function(code) {
  run <- ebirdst_runs[ebirdst_runs$species_code == code, ]
  if (nrow(run) == 0) return(list(no_data = "not in Status and Trends"))

  path <- tryCatch(
    ebirdst_download_status(code, download_abundance = FALSE,
                            download_regional = TRUE, download_occurrence = TRUE,
                            pattern = "regional_stats|_occurrence_median_27km_"),
    error = function(e) NULL)
  if (is.null(path)) return(list(no_data = "Status and Trends download failed"))

  rs_file <- file.path(path, "regional_stats.csv")
  rs <- if (file.exists(rs_file)) read.csv(rs_file) else data.frame()
  ca <- rs[rs$region_code %in% "USA-CA", ]
  if (nrow(ca) == 0) {
    return(list(no_data = "in Status and Trends, but no California range"))
  }
  rare <- max(ca$total_pop_percent, na.rm = TRUE) < RARE_POP_SHARE

  # mean weekly occurrence across California, averaged by month
  mon <- NULL
  tif <- list.files(path, pattern = "_occurrence_median_27km_.*\\.tif$",
                    recursive = TRUE, full.names = TRUE)
  if (length(tif) > 0) {
    r <- rast(tif[1])
    cav <- vect(st_transform(ca_boundary, crs(r)))
    wk <- global(mask(crop(r, cav), cav), "mean", na.rm = TRUE)$mean
    mon <- as.vector(tapply(wk, factor(as.integer(format(as.Date(names(r)), "%m")), levels = 1:12), mean))
  }
  list(run = run, ca = ca, mon = mon, rare = rare)
}

# Months that contradict the type, e.g. a winter visitor absent in winter.
months_mismatch <- function(type, occ) {
  switch(type,
    "winter visitor" = !all(occ[c(12, 1, 2)]),
    "summer visitor" = !all(occ[c(6, 7)]),
    "migrant"        = any(occ[c(12, 1, 2)]),
    FALSE)
}

classify <- function(code, common_name, d, share) {
  row <- function(type, months = "", notes = "") {
    o <- OVERRIDES[[code]]
    if (!is.null(o)) { type <- o$migration_type; notes <- o$notes }
    data.frame(ebird_code = code, common_name = common_name,
               migration_type = type, occupied_months = months, notes = notes)
  }
  if (!is.null(d$no_data)) return(row("no data", notes = d$no_data))
  ca <- d$ca

  # migration type from California seasonal abundance
  if ("resident" %in% ca$season) {
    type <- "year-round"
    seasons_used <- "resident"
  } else {
    ab <- setNames(ca$abundance_mean, ca$season)
    occ <- ab >= share * max(ab, na.rm = TRUE)
    occ[is.na(occ)] <- FALSE
    has <- function(s) s %in% names(occ) && occ[[s]]
    # rule order: year-round, winter visitor, migrant, summer visitor
    type <- if (has("breeding") && has("nonbreeding")) "year-round"
      else if (has("nonbreeding")) "winter visitor"
      else if (!has("breeding") &&
               (has("prebreeding_migration") || has("postbreeding_migration"))) "migrant"
      else if (has("breeding")) "summer visitor"
      else NA
    seasons_used <- names(occ)[occ]
  }
  if (is.na(type)) return(row("no data", notes = "rules unclear: no season reached threshold"))

  # occupied months from weekly occurrence trimmed to California
  notes <- character()
  if (!is.null(d$mon) && any(!is.na(d$mon))) {
    occ_months <- d$mon >= share * max(d$mon, na.rm = TRUE)
    occ_months[is.na(occ_months)] <- FALSE
  } else {
    occ_months <- months_from_runs(d$run, seasons_used)
    notes <- c(notes, "months from range-wide season dates (fallback)")
  }
  if ("resident" %in% ca$season) occ_months[] <- TRUE

  if (months_mismatch(type, occ_months)) notes <- c(notes, MISMATCH_NOTE)
  if (isTRUE(d$rare)) notes <- c(notes, RARE_NOTE)
  row(type, format_months(occ_months), paste(notes, collapse = "; "))
}

args <- commandArgs(trailingOnly = TRUE)
opt <- function(name) {
  hit <- grep(paste0("^--", name, "="), args, value = TRUE)
  if (length(hit)) sub(paste0("^--", name, "="), "", hit[1]) else NULL
}
shares <- if (is.null(opt("shares"))) OCCUPIED_SHARE else as.numeric(strsplit(opt("shares"), ",")[[1]])
out_dir <- opt("out")
codes <- grep("^--", args, value = TRUE, invert = TRUE)

if (length(codes) > 0) {
  sp <- data.frame(ebird_code = codes,
                   common_name = ebirdst_runs$common_name[match(codes, ebirdst_runs$species_code)])
  sp$common_name[is.na(sp$common_name)] <- codes[is.na(sp$common_name)]
} else {
  sp <- read.csv("ca_species_all.csv")
}

data <- Map(function(code) {
  if (length(codes) == 0) message(code)
  tryCatch(load_species(code), error = function(e) list(no_data = paste("error:", conditionMessage(e))))
}, sp$ebird_code)

for (share in shares) {
  out <- do.call(rbind, Map(classify, sp$ebird_code, sp$common_name, data, share))
  rownames(out) <- NULL
  if (length(codes) > 0) {
    cat("\n== cutoff", share, "==\n")
    print(out, right = FALSE)
  } else if (!is.null(out_dir)) {
    f <- file.path(out_dir, sprintf("ca_species_status_%s.csv", share))
    write.csv(out, f, row.names = FALSE)
    message(nrow(out), " species written to ", f)
  } else {
    message(nrow(out), " species downloaded; nothing written (run classify_ca_status_v5.R next)")
    break
  }
}
