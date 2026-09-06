#!/usr/bin/env Rscript
#
# Fits one logistic regression per presidential cycle on CES cumulative data
# and writes data/models/<year>.json, replacing the placeholder fixture.
#
# The specification is IDENTICAL across cycles by construction. That is the
# whole basis of the year-over-year comparison: if the model changed between
# years, movement in the app would be movement in the method. Do not add a
# term for one cycle only.
#
# Usage:
#   Rscript scripts/fit_models.R path/to/cumulative_ces.dta
#
# Get the data (approx 1 GB, NOT committed - see DATA.md):
#   https://doi.org/10.7910/DVN/II2DB6
#
# Requires: haven, dplyr, tidyr, jsonlite

suppressPackageStartupMessages({
  library(haven); library(dplyr); library(tidyr); library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("usage: Rscript scripts/fit_models.R <cumulative_ces.dta>")
src <- args[[1]]
out_dir <- file.path(dirname(dirname(normalizePath(src, mustWork = FALSE))), "data", "models")
out_dir <- "data/models"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

CYCLES <- c(2008, 2012, 2016, 2020, 2024)

message("reading ", src)
raw <- read_dta(src) %>%
  filter(year %in% CYCLES) %>%
  select(year, case_id, weight, starts_with("vv_turnout"), voted_pres_party,
         gender, birthyr, race_h, educ, faminc, marstat, religion,
         relig_bornagain, union_hh, st, any_of("region"))

# --- Trap 1: income ---------------------------------------------------------
# CES codes family income in NOMINAL dollar brackets, top-coded at 150k+. Used
# as-is across cycles, inflation masquerades as a shifting income effect. We
# convert to a within-year population quintile, so "middle" means the same
# position in the distribution in 2008 and 2024 even though the dollars differ.
income_quintile <- function(df) {
  df %>%
    mutate(faminc_ord = suppressWarnings(as.integer(haven::as_factor(faminc)))) %>%
    group_by(year) %>%
    mutate(
      inc_rank = if_else(is.na(faminc_ord), NA_real_,
                         rank(faminc_ord, na.last = "keep", ties.method = "average") /
                           sum(!is.na(faminc_ord))),
      income = case_when(
        is.na(inc_rank)   ~ NA_character_,
        inc_rank <= 0.20  ~ "bottom20",
        inc_rank <= 0.40  ~ "lower_mid",
        inc_rank <= 0.60  ~ "middle",
        inc_rank <= 0.80  ~ "upper_mid",
        TRUE              ~ "top20"
      )
    ) %>%
    ungroup()
}

CENSUS_REGION <- c(
  CT="northeast", ME="northeast", MA="northeast", NH="northeast", RI="northeast",
  VT="northeast", NJ="northeast", NY="northeast", PA="northeast",
  IL="midwest", IN="midwest", MI="midwest", OH="midwest", WI="midwest",
  IA="midwest", KS="midwest", MN="midwest", MO="midwest", NE="midwest",
  ND="midwest", SD="midwest",
  DE="south", DC="south", FL="south", GA="south", MD="south", NC="south",
  SC="south", VA="south", WV="south", AL="south", KY="south", MS="south",
  TN="south", AR="south", LA="south", OK="south", TX="south",
  AZ="west", CO="west", ID="west", MT="west", NV="west", NM="west", UT="west",
  WY="west", AK="west", CA="west", HI="west", OR="west", WA="west"
)

lab <- function(x) as.character(haven::as_factor(x))

prepped <- raw %>%
  income_quintile() %>%
  mutate(
    # --- Trap 3: outcome ---------------------------------------------------
    # voted_pres_party in a presidential year is THAT year's vote. The
    # voted_pres_08 / _12 / _16 / _20 columns are RECALLED prior votes and
    # carry heavy recall bias toward the winner - never use them as y.
    vote = lab(voted_pres_party),
    y = case_when(vote == "Democratic" ~ 1L, vote == "Republican" ~ 0L, TRUE ~ NA_integer_),

    age_n = year - as.integer(birthyr),
    age = case_when(age_n < 30 ~ "18_29", age_n < 45 ~ "30_44",
                    age_n < 65 ~ "45_64", age_n >= 65 ~ "65_up", TRUE ~ NA_character_),

    # --- Trap 4: gender ----------------------------------------------------
    # The binary `gender` item is the only one asked consistently across the
    # whole window. gender4 exists only in recent cycles and cannot be used
    # without breaking comparability.
    gender = recode(lab(gender), "Male" = "man", "Female" = "woman", .default = NA_character_),

    # --- Trap 2: race ------------------------------------------------------
    # race_h (any-part Hispanic), not raw `race`: the Hispanic follow-up
    # question was routed differently in three separate periods, so raw race
    # is not comparable across cycles. The maintainers flag race_h as stable.
    race = case_when(
      grepl("^White", lab(race_h))    ~ "white",
      grepl("^Black", lab(race_h))    ~ "black",
      grepl("^Hispanic", lab(race_h)) ~ "hispanic",
      grepl("^Asian", lab(race_h))    ~ "asian",
      is.na(lab(race_h))              ~ NA_character_,
      TRUE                            ~ "other"
    ),

    educ = recode(lab(educ),
      "No HS" = "no_hs", "High school graduate" = "hs", "Some college" = "some_college",
      "2-year" = "two_year", "4-year" = "four_year", "Post-grad" = "postgrad",
      .default = NA_character_),

    marstat = if_else(grepl("^Married", lab(marstat)), "married", "not_married",
                      missing = NA_character_),

    religion = case_when(
      grepl("^Protestant", lab(religion))       ~ "protestant",
      grepl("^Roman Catholic|^Catholic", lab(religion)) ~ "catholic",
      grepl("^Jewish", lab(religion))           ~ "jewish",
      grepl("^Muslim", lab(religion))           ~ "muslim",
      grepl("^Nothing in particular", lab(religion)) ~ "nothing",
      grepl("^Atheist|^Agnostic", lab(religion))~ "none",
      is.na(lab(religion))                      ~ NA_character_,
      TRUE                                      ~ "other"
    ),

    bornagain = if_else(lab(relig_bornagain) == "Yes", "yes", "no", missing = NA_character_),
    union_hh  = if_else(lab(union_hh) == "Yes", "yes", "no", missing = NA_character_),
    region    = unname(CENSUS_REGION[lab(st)])
  )

# Validated voters where vote validation ran; otherwise self-reported vote.
if ("vv_turnout_gvm" %in% names(prepped)) {
  prepped <- prepped %>%
    filter(is.na(vv_turnout_gvm) | grepl("Voted", lab(vv_turnout_gvm)))
}

FEATURES <- list(
  gender    = c("man", "woman"),
  age       = c("18_29", "30_44", "45_64", "65_up"),
  race      = c("white", "black", "hispanic", "asian", "other"),
  educ      = c("no_hs", "hs", "some_college", "two_year", "four_year", "postgrad"),
  income    = c("bottom20", "lower_mid", "middle", "upper_mid", "top20"),
  marstat   = c("married", "not_married"),
  religion  = c("protestant", "catholic", "jewish", "muslim", "other", "nothing", "none"),
  bornagain = c("no", "yes"),
  union_hh  = c("no", "yes"),
  region    = c("northeast", "midwest", "south", "west")
)
# Reference level per feature; must match the level whose coefficient the
# engine expects to be exactly 0 (asserted in predict.test.ts).
REFERENCE <- c(gender = "man", age = "45_64", race = "white", educ = "hs",
               income = "middle", marstat = "married", religion = "protestant",
               bornagain = "no", union_hh = "no", region = "midwest")

LABELS <- list(
  gender = c(man = "Man", woman = "Woman"),
  age = c("18_29" = "18-29", "30_44" = "30-44", "45_64" = "45-64", "65_up" = "65+"),
  race = c(white = "White", black = "Black", hispanic = "Hispanic / Latino",
           asian = "Asian", other = "Other"),
  educ = c(no_hs = "No high school diploma", hs = "High school graduate",
           some_college = "Some college", two_year = "2-year degree",
           four_year = "4-year degree", postgrad = "Postgraduate degree"),
  income = c(bottom20 = "Bottom fifth", lower_mid = "Lower-middle", middle = "Middle",
             upper_mid = "Upper-middle", top20 = "Top fifth"),
  marstat = c(married = "Married", not_married = "Not married"),
  religion = c(protestant = "Protestant", catholic = "Catholic", jewish = "Jewish",
               muslim = "Muslim", other = "Something else",
               nothing = "Nothing in particular", none = "Atheist or agnostic"),
  bornagain = c(no = "No", yes = "Yes"),
  union_hh = c(no = "No", yes = "Yes"),
  region = c(northeast = "Northeast", midwest = "Midwest", south = "South", west = "West")
)
QUESTIONS <- c(
  gender = "Are you...?", age = "How old are you?",
  race = "What racial or ethnic group best describes you?",
  educ = "What is the highest level of education you have completed?",
  income = "Roughly where does your household income sit nationally?",
  marstat = "What is your marital status?",
  religion = "What is your present religion, if any?",
  bornagain = "Would you describe yourself as a born-again or evangelical Christian?",
  union_hh = "Are you or is anyone in your household a union member?",
  region = "Where do you live?"
)
FEATURE_LABELS <- c(gender = "Gender", age = "Age", race = "Race or ethnicity",
                    educ = "Education", income = "Household income",
                    marstat = "Marital status", religion = "Religion",
                    bornagain = "Born-again or evangelical",
                    union_hh = "Union household", region = "Region")

fml <- as.formula(paste("y ~", paste(names(FEATURES), collapse = " + ")))

for (yr in CYCLES) {
  d <- prepped %>%
    filter(year == yr, !is.na(y)) %>%
    drop_na(all_of(names(FEATURES)))

  # Relevel so the reference category matches REFERENCE, giving it coef 0.
  for (f in names(FEATURES)) {
    d[[f]] <- relevel(factor(d[[f]], levels = FEATURES[[f]]), ref = REFERENCE[[f]])
  }

  fit <- glm(fml, family = binomial(), data = d, weights = d$weight)
  co <- coef(fit)

  features <- lapply(names(FEATURES), function(f) {
    lv <- FEATURES[[f]]
    # Weighted share of this cycle's two-party voters in each level.
    sh <- sapply(lv, function(l) sum(d$weight[d[[f]] == l]) / sum(d$weight))
    list(
      id = f,
      label = unname(FEATURE_LABELS[[f]]),
      question = unname(QUESTIONS[[f]]),
      levels = lapply(seq_along(lv), function(i) {
        term <- paste0(f, lv[[i]])
        list(
          id = lv[[i]],
          label = unname(LABELS[[f]][[lv[[i]]]]),
          coef = round(unname(if (lv[[i]] == REFERENCE[[f]]) 0 else
                                if (is.na(co[term])) 0 else co[term]), 4),
          share = round(unname(sh[[i]]), 4)
        )
      })
    )
  })

  model <- list(
    year = yr,
    intercept = round(unname(co[["(Intercept)"]]), 4),
    features = features,
    meta = list(
      n = nrow(d),
      source = paste0("CES Cumulative Common Content (doi:10.7910/DVN/II2DB6), fitted ",
                      format(Sys.Date())),
      synthetic = FALSE
    )
  )

  path <- file.path(out_dir, paste0(yr, ".json"))
  write(toJSON(model, auto_unbox = TRUE, pretty = TRUE, digits = NA), path)
  message(sprintf("%d: n=%d -> %s", yr, nrow(d), path))
}

message("done. run `npm test` - the engine asserts share sums and reference levels.")
