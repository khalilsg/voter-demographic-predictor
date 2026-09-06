# Data

## Source

[Cumulative CES Common Content](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/II2DB6)
— the Cooperative Election Study, harmonized across years by Shiro Kuriwaki.

Five presidential cycles, one identical specification, verified respondent
counts:

| Cycle | n (unweighted, common content) |
|------:|-------------------------------:|
| 2008 | 32,800 |
| 2012 | 54,535 |
| 2016 | 64,600 |
| 2020 | 61,000 |
| 2024 | 60,000 |

### Why not exit polls

Two disqualifiers. Nobody harmonized them — income brackets, education
categories, and question wording drift between cycles, so a year-over-year
comparison silently mixes real change with instrument change. And 2020 broke
the instrument outright: Edison added phone polling of early and mail voters
for COVID, and AP/Fox left the consortium for VoteCast. Exit polls are useful
here only as a sanity check on a fitted result, never as the model.

### Why not ANES

[ANES](https://electionstudies.org/data-center/anes-time-series-cumulative-data-file/)
reaches back to 1948 and codes income as percentiles natively, which is
genuinely better. But at 1,200–8,000 respondents per cycle it is far too thin
for a ten-term model. Revisit if the project ever needs pre-2008 cycles.

## Licensing

Harvard Dataverse applies a **CC0 1.0 public-domain waiver** by default to
datasets, and CES is openly downloadable with no registration or access
request. No restriction on private repos, public deployment, or commercial use.

Dataverse lets depositors override that default with custom Terms of Use, so it
had to be checked rather than assumed. **Checked on 2026-09-06: the dataset's
Terms of Use field reads CC0 1.0**, the default waiver, with no additional
conditions. Re-check if you pull a newer version of the file.

One thing is *not* CC0: the
[`kuriwaki/cces_cumulative`](https://github.com/kuriwaki/cces_cumulative) build
repository has **no license file**, so its code is all-rights-reserved by
default. The published data is free to use; do not copy its R harmonization
code into this repo.

CC0 waives the legal requirement to attribute, but
[Dataverse Community Norms](https://dataverse.org/best-practices/dataverse-community-norms)
ask for citation, and this costs nothing:

```
Kuriwaki, Shiro. "Cumulative CES Common Content."
https://doi.org/10.7910/DVN/II2DB6, Harvard Dataverse.

Schaffner, Brian; Ansolabehere, Stephen; Shih, Marissa.
"Cooperative Election Study Common Content, 2020."
https://doi.org/10.7910/DVN/E9N6PH, Harvard Dataverse.
```

Take exact version strings and per-year author lists from each dataset page;
they vary by year.

## Reference data

Two small files under `data/reference/` are joined at fit time. Neither
contains survey responses.

**`county_urbanicity.json`** — county FIPS to a three-level urbanicity band,
from the USDA Economic Research Service's
[Rural-Urban Continuum Codes 2023](https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/),
a US federal government product and therefore public domain. Codes are
collapsed 1 / 2-3 / 4-9. Obtained via the MIT-licensed
[`cwimpy/rurality`](https://github.com/cwimpy/rurality) R package; the data
itself is the USDA's.

This measures metro **size**, not city versus suburb — a large metro county
contains both — because county is the finest geography the CES carries for
every respondent. The level names say so rather than implying more.

**`turnout_targets.json`** — known within-group vote shares to rake the sample
to, currently empty. See the under-30 limitation below and the file's own
notes; filling it requires exit-poll crosstabs, and a guessed target would be a
prior wearing a data costume.

## Never commit the microdata

The binding constraint here is not the license — CC0 would permit
redistribution. It is that CES microdata carries `zipcode`, `county_fips`,
`birthyr`, `state`, and voter-file-matched validation fields. ZIP plus date of
birth plus sex is the textbook re-identification triple.

`data/raw/` is gitignored from the first commit. Only `data/models/*.json` is
tracked — fitted coefficients over tens of thousands of respondents, from which
nothing individual survives, at a few KB instead of a gigabyte.

## Four harmonization traps

All four are documented by the cumulative file's maintainers. Three would
silently corrupt results rather than fail loudly. `scripts/fit_models.R`
handles each; the comments there mark the spots.

**1. Income is nominal dollars.** Brackets are dollar-denominated, coarsened,
and top-coded at `150k+`. `$50–60k` in 2008 is not `$50–60k` in 2024 — used
raw, inflation shows up as a drifting income effect. We convert to a
**within-year quintile**, which also makes the UI question easier to answer
than a dollar bracket.

**2. The race/Hispanic item was routed three different ways.** Before 2017 the
Hispanic follow-up was not asked of people who answered "Hispanic" to race;
2018–2022 it was asked of everyone; from 2024 it is auto-set for Hispanic
respondents. Use **`race_h`** (any-part Hispanic), which the maintainers flag
as the stable version. Never raw `race`.

**3. `voted_pres_08/12/16/20` are recalled prior votes.** They are asked in
later surveys and carry heavy recall bias toward the eventual winner. The
outcome variable is **`voted_pres_party` within each presidential year**, which
is that year's contemporaneous vote.

**3b. Not every question exists in every cycle.** Union membership is absent
from 2008 entirely. The fit gives each cycle the features it carries, and the
app excludes a cycle from the comparison when the user answers something that
cycle cannot score — see DESIGN.md section 1. `scripts/fit_models.py` reports
what is missing where before it fits anything.

**4. `gender` is binary; `gender4` exists only in recent cycles.** Cross-cycle
comparability requires the binary item. This is a real limitation of the source
data, not a modeling choice, and the UI should not pretend otherwise.

## Regenerating the models

```bash
# Download the cumulative file (~1 GB) to data/raw/ — gitignored.
python3 scripts/fit_models.py data/raw/cumulative_ces.dta   # or fit_models.R
npm test     # share sums, reference levels, cross-cycle spec identity
npm run check  # the fit against reference points whose real values are known
```

See [SETUP.md](SETUP.md) for step-by-step instructions.

Until that runs, `data/models/*.json` holds placeholder coefficients from
`npm run fixture`, every file carries `meta.synthetic: true`, and the UI shows
a banner saying so.
