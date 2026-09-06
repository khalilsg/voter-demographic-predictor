# Fitting the real models

Start to finish, roughly 30 minutes — most of it waiting on a ~1 GB download.
Until you do this the app runs on placeholder coefficients and says so in a
banner.

**Read [DATA.md](DATA.md) first** if you have not: it covers the licensing and
the four harmonization traps the script handles.

---

## 1. Prerequisites

You need **either Python or R** — the fit script exists in both, producing
identical output. Python is the lower-friction path and what the rest of this
guide assumes.

### Python (recommended)

```bash
python3 --version          # 3.9 or newer
```

```bash
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### R (alternative)

Only if you would rather use R. `Rscript` is not installed by default on macOS
or most Linux distributions — if you got `command not found: Rscript`, that is
why.

```bash
brew install r                                    # macOS
sudo apt install r-base                           # Debian/Ubuntu
Rscript -e 'install.packages(c("haven","dplyr","tidyr","jsonlite"), repos="https://cloud.r-project.org")'
```

Substitute `Rscript scripts/fit_models.R` for `python3 scripts/fit_models.py`
throughout; everything else is the same.

**The repo:**

```bash
git clone https://github.com/khalilsg/voter-demographic-predictor.git
cd voter-demographic-predictor
npm install
```

### Check the toolchain before downloading a gigabyte

This runs the entire pipeline on a small synthetic file, so you find out now
rather than after the download:

```bash
python3 scripts/make-test-dta.py /tmp/test_ces.dta
python3 scripts/fit_models.py /tmp/test_ces.dta
npm test
```

Tests should pass. `npm run check` will report the numbers as implausible —
that is correct, the synthetic file is noise. What you are confirming is that
the script runs end to end and writes model files the engine accepts. Restore
the placeholders afterwards with `npm run fixture`.

## 2. Download the data

Open the dataset page:

**https://doi.org/10.7910/DVN/II2DB6**

Then:

1. Click **Access Dataset** → **Download ZIP**. No account or access request is
   needed. The **Terms of Use** field was verified as CC0 1.0 on 2026-09-06; if a
   newer version of the file shows anything else, stop and re-read DATA.md
   before using it.
2. You want the **Stata (`.dta`)** file, named something like
   `cumulative_2006-2024.dta`. It is roughly 1 GB. If Dataverse offers you a
   `.tab` export instead, take the original `.dta` — the `.tab` conversion
   drops the value labels the script relies on to read categories.
3. Put it here, and **only** here:

```bash
mkdir -p data/raw
mv ~/Downloads/cumulative_*.dta data/raw/
```

`data/raw/` is gitignored, as is every microdata format anywhere in the tree.
Confirm before you go further:

```bash
git status --porcelain          # must NOT list anything under data/raw/
npm test                        # includes the guard that enforces this
```

If either shows the data file, stop — do not commit. That file carries zip
code, birth year, and voter-file matches for hundreds of thousands of real
people.

## 3. Fit

```bash
python3 scripts/fit_models.py data/raw/cumulative_2006-2024.dta
```

Expect five or ten minutes, mostly reading the file. You should see:

```
reading data/raw/cumulative_2006-2024.dta
2008: n=24817 -> data/models/2008.json
2012: n=41903 -> data/models/2012.json
2016: n=48210 -> data/models/2016.json
2020: n=47655 -> data/models/2020.json
2024: n=46102 -> data/models/2024.json
```

Those `n` values are illustrative — yours will differ. They will be
meaningfully **lower** than the raw cycle sizes in DATA.md, which is expected:
the script keeps only two-party presidential voters with no missing values on
any of the ten questions.

## 4. Check the fit before trusting it

```bash
npm test
```

33 tests. They assert that shares sum to 1 per feature, that each feature has
exactly one reference level, that the specification is identical across all
five cycles, and that no microdata got tracked.

Then sanity-check against reality — this is the step that catches a silently
wrong recode, and the tests above cannot do it. They check internal
consistency; this checks that the model is about the right world.

```bash
npm run check
```

```
cycle  avg voter             Black   wht evang  Hispanic  n        fitted
--------------------------------------------------------------------------
2008   53.7% D (real 53.7%)    89%       31%       71%   24,817   yes
...
```

It flags anything out of range for you, but here is what it is checking and
what a failure means:

| Check | Expected | If it is off |
|---|---|---|
| `fitted` column | `yes` on all five | The script did not overwrite; check for a write error |
| Average voter | Within ~2 pts of the real result | Weighting or the two-party filter is wrong |
| Black voters | ~85-95% D every cycle | The `race_h` recode failed — see DATA.md trap 2 |
| White evangelicals | ~15-25% D every cycle | Sign error, or reference levels are inverted |
| Hispanic voters | Clearly declining D share 2016 → 2024 | The recode may be collapsing categories |

If the average voter is wildly off in **one** cycle only, suspect that year's
value labels rather than the whole script — the CES recodes some items between
waves and `haven::as_factor` will surface the label text as-is.

## 5. Run it

```bash
npm run dev          # http://localhost:5173
```

The placeholder banner should now be gone. If it is still showing, the app is
reading stale models — hard-reload the page (a plain refresh on a Vite dev
server can serve a cached module).

## 6. Commit the coefficients

```bash
git add data/models/
git status --short    # data/models/*.json ONLY — nothing else
git commit -m "Fit models on CES cumulative data"
```

Five small JSON files. If `git status` shows anything else under `data/`, stop
and re-read step 2.

---

## If it breaks

**`command not found: Rscript`** — R is not installed. Use the Python script
instead; it does the same thing.

**`ModuleNotFoundError: No module named 'pandas'`** — the virtualenv is not
active. Re-run `source .venv/bin/activate`.

**`could not read value labels`** — install `pyreadstat`, which handles Stata
files whose label tables make the pandas reader raise.

**`Error: cannot allocate vector of size ...`** — the file does not fit in RAM.
Read it in chunks or use a machine with more memory; the full file wants
roughly 8 GB free.

**All coefficients come out `0`** — the level strings in `FEATURES` did not
match the data's value labels. Print what is actually there:

```bash
python3 -c "import pandas as pd; d = pd.read_stata('data/raw/cumulative_2006-2024.dta', columns=['educ','race_h'], convert_categoricals=True); print(d.educ.value_counts()); print(d.race_h.value_counts())"
```

Then adjust the mappings in `scripts/fit_models.py` (and `fit_models.R`, if you use it) to match. The label
text is the most likely thing to have drifted since the script was written.

**A cycle reports `n=0`** — that year is missing `voted_pres_party`, or every
row was dropped by `drop_na`. Check which column is empty before assuming the
data is bad.
