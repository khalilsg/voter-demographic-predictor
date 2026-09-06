#!/usr/bin/env python3
"""Write a small synthetic CES-shaped .dta so the fit pipeline can be tested
without downloading a gigabyte first.

The point is to exercise the parts that actually break: the value-label text
the recodes match against, the column names, and the shape of the output. The
vote behaviour is invented, so the resulting coefficients mean nothing - what
you are checking is that the script runs end to end and produces a model file
the engine accepts.

    python3 scripts/make-test-dta.py /tmp/test_ces.dta
    python3 scripts/fit_models.py /tmp/test_ces.dta
    npm test && npm run check

Requires: pandas, numpy
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

CYCLES = [2008, 2012, 2016, 2020, 2024]
N_PER_CYCLE = 4000
rng = np.random.default_rng(20260906)

# Value-label text exactly as the real cumulative file spells it. If the recodes
# in fit_models.py stop matching these strings, the fit silently yields nothing.
GENDER = ["Male", "Female"]
RACE_H = ["White", "Black", "Hispanic", "Asian", "Native American", "Middle Eastern"]
EDUC = ["No HS", "High school graduate", "Some college", "2-year", "4-year", "Post-grad"]
FAMINC = ["Less than 10k", "10k - 20k", "20k - 30k", "30k - 40k", "40k - 50k",
          "50k - 60k", "60k - 70k", "70k - 80k", "80k - 100k", "100k - 120k",
          "120k - 150k", "150k+"]
# Non-bracket income answers, which the real file also carries. These are
# missing income, not a high bracket — a fixture without them let a version of
# fit_models.py ship that ranked a refusal as though it were a dollar amount.
FAMINC_NONRESPONSE = ["Prefer not to say", "Skipped", "Not Asked"]
MARSTAT = ["Married", "Separated", "Divorced", "Widowed", "Single", "Domestic partnership"]
RELIGION = ["Protestant", "Roman Catholic", "Jewish", "Muslim", "Buddhist", "Hindu",
            "Atheist", "Agnostic", "Nothing in particular", "Something else"]
YESNO = ["Yes", "No"]
STATES = list("""CT ME MA NH RI VT NJ NY PA IL IN MI OH WI IA KS MN MO NE ND SD
DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX AZ CO ID MT NV NM UT WY AK CA
HI OR WA""".split())

rows = []
for year in CYCLES:
    n = N_PER_CYCLE
    gender = rng.choice(GENDER, n)
    race = rng.choice(RACE_H, n, p=[0.70, 0.11, 0.11, 0.04, 0.02, 0.02])
    educ = rng.choice(EDUC, n, p=[0.04, 0.27, 0.22, 0.10, 0.24, 0.13])
    faminc = rng.choice(FAMINC + FAMINC_NONRESPONSE, n,
                        p=[0.08] * 12 + [0.02, 0.01, 0.01])
    marstat = rng.choice(MARSTAT, n, p=[0.52, 0.03, 0.12, 0.06, 0.24, 0.03])
    religion = rng.choice(RELIGION, n, p=[0.38, 0.20, 0.02, 0.01, 0.01, 0.01,
                                          0.05, 0.04, 0.20, 0.08])
    born = rng.choice(YESNO, n, p=[0.30, 0.70])
    union = rng.choice(YESNO, n, p=[0.13, 0.87])
    st = rng.choice(STATES, n)
    birthyr = rng.integers(year - 85, year - 18, n)

    # Invented vote propensity - just enough structure that the fit converges
    # and the reference levels are exercised. Not a model of anything.
    lp = (
        0.05
        + 0.40 * (gender == "Female")
        + 2.00 * (race == "Black")
        + 0.80 * (race == "Hispanic")
        + 0.50 * np.isin(educ, ["4-year", "Post-grad"]) * ((year - 2008) / 16)
        - 0.90 * (born == "Yes")
        + 0.30 * (union == "Yes")
        + 0.30 * ((year - birthyr) < 30)
    )
    y = rng.random(n) < 1 / (1 + np.exp(-lp))

    # Third-party and unrecorded votes: the model is two-party, so these must
    # drop out rather than land in either bucket.
    party = np.where(y, "Democratic", "Republican").astype(object)
    other = rng.random(n) < 0.04
    party[other] = rng.choice(["Other", "Not sure", "Did not vote"], other.sum())

    rows.append(pd.DataFrame({
        "year": year,
        "case_id": np.arange(n) + year * 100000,
        "weight": rng.gamma(9, 1 / 9, n),
        "voted_pres_party": party,
        "vv_turnout_gvm": rng.choice(["Voted", "No Record"], n, p=[0.85, 0.15]),
        "gender": gender, "birthyr": birthyr, "race_h": race, "educ": educ,
        "faminc": faminc, "marstat": marstat, "religion": religion,
        "relig_bornagain": born, "union_hh": union, "st": st,
    }))

df = pd.concat(rows, ignore_index=True)

# Punch missing values into every recoded column. Real survey data is full of
# them, and pandas string columns compare to pd.NA rather than False — numpy
# raises "boolean value of NA is ambiguous" the moment such a mask reaches
# np.where. A fixture with no NAs cannot catch that, and did not.
for col, rate in [("voted_pres_party", 0.02), ("gender", 0.01), ("birthyr", 0.01),
                  ("race_h", 0.02), ("educ", 0.02), ("faminc", 0.03),
                  ("marstat", 0.02), ("religion", 0.02), ("relig_bornagain", 0.05),
                  ("union_hh", 0.03), ("st", 0.01), ("vv_turnout_gvm", 0.10)]:
    df.loc[rng.random(len(df)) < rate, col] = None
# Categoricals become Stata value labels, which is what the recodes read.
for col in ["voted_pres_party", "vv_turnout_gvm", "gender", "race_h", "educ",
            "faminc", "marstat", "religion", "relig_bornagain", "union_hh", "st"]:
    df[col] = pd.Categorical(df[col])

out = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/test_ces.dta")
df.to_stata(out, write_index=False, version=118)
print(f"wrote {out} — {len(df):,} rows across {len(CYCLES)} cycles")
