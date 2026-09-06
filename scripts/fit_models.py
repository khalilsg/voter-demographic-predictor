#!/usr/bin/env python3
"""Fit one logistic regression per presidential cycle on CES cumulative data.

A port of scripts/fit_models.R, for people who would rather not install R. The
two are kept deliberately in step: same features, same reference levels, same
recodes, same output schema. If you change one, change the other.

The specification is IDENTICAL across cycles by construction. That is the whole
basis of the year-over-year comparison: if the model changed between years,
movement in the app would be movement in the method. Do not add a term for one
cycle only.

Usage:
    python3 scripts/fit_models.py data/raw/cumulative_ces.dta

Get the data (~1 GB, NOT committed - see DATA.md):
    https://doi.org/10.7910/DVN/II2DB6

Requires: pandas, numpy, statsmodels  (pyreadstat optional but faster)
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

CYCLES = [2008, 2012, 2016, 2020, 2024]

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "models"

# Columns pulled from the file. Reading only these keeps a ~1 GB Stata file
# inside a few hundred MB of RAM.
COLUMNS = [
    "year", "case_id", "weight", "voted_pres_party", "vv_turnout_gvm",
    "gender", "birthyr", "race_h", "educ", "faminc", "marstat", "religion",
    "relig_bornagain", "union_hh", "st",
]

FEATURES: dict[str, list[str]] = {
    "gender":    ["man", "woman"],
    "age":       ["18_29", "30_44", "45_64", "65_up"],
    "race":      ["white", "black", "hispanic", "asian", "other"],
    "educ":      ["no_hs", "hs", "some_college", "two_year", "four_year", "postgrad"],
    "income":    ["bottom20", "lower_mid", "middle", "upper_mid", "top20"],
    "marstat":   ["married", "not_married"],
    "religion":  ["protestant", "catholic", "jewish", "muslim", "other", "nothing", "none"],
    "bornagain": ["no", "yes"],
    "union_hh":  ["no", "yes"],
    "region":    ["northeast", "midwest", "south", "west"],
}

# Reference level per feature. Must match the level the engine expects to have
# coefficient exactly 0 (asserted in src/engine/predict.test.ts).
REFERENCE = {
    "gender": "man", "age": "45_64", "race": "white", "educ": "hs",
    "income": "middle", "marstat": "married", "religion": "protestant",
    "bornagain": "no", "union_hh": "no", "region": "midwest",
}

FEATURE_LABELS = {
    "gender": "Gender", "age": "Age", "race": "Race or ethnicity",
    "educ": "Education", "income": "Household income",
    "marstat": "Marital status", "religion": "Religion",
    "bornagain": "Born-again or evangelical", "union_hh": "Union household",
    "region": "Region",
}

QUESTIONS = {
    "gender": "Are you...?",
    "age": "How old are you?",
    "race": "What racial or ethnic group best describes you?",
    "educ": "What is the highest level of education you have completed?",
    "income": "Roughly where does your household income sit nationally?",
    "marstat": "What is your marital status?",
    "religion": "What is your present religion, if any?",
    "bornagain": "Would you describe yourself as a born-again or evangelical Christian?",
    "union_hh": "Are you or is anyone in your household a union member?",
    "region": "Where do you live?",
}

LABELS = {
    "gender": {"man": "Man", "woman": "Woman"},
    "age": {"18_29": "18–29", "30_44": "30–44", "45_64": "45–64", "65_up": "65+"},
    "race": {"white": "White", "black": "Black", "hispanic": "Hispanic / Latino",
             "asian": "Asian", "other": "Other"},
    "educ": {"no_hs": "No high school diploma", "hs": "High school graduate",
             "some_college": "Some college", "two_year": "2-year degree",
             "four_year": "4-year degree", "postgrad": "Postgraduate degree"},
    "income": {"bottom20": "Bottom fifth", "lower_mid": "Lower-middle",
               "middle": "Middle", "upper_mid": "Upper-middle", "top20": "Top fifth"},
    "marstat": {"married": "Married", "not_married": "Not married"},
    "religion": {"protestant": "Protestant", "catholic": "Catholic", "jewish": "Jewish",
                 "muslim": "Muslim", "other": "Something else",
                 "nothing": "Nothing in particular", "none": "Atheist or agnostic"},
    "bornagain": {"no": "No", "yes": "Yes"},
    "union_hh": {"no": "No", "yes": "Yes"},
    "region": {"northeast": "Northeast", "midwest": "Midwest", "south": "South",
               "west": "West"},
}

NAME_TO_ABBR = {
    "Connecticut": "CT", "Maine": "ME", "Massachusetts": "MA", "New Hampshire": "NH",
    "Rhode Island": "RI", "Vermont": "VT", "New Jersey": "NJ", "New York": "NY",
    "Pennsylvania": "PA", "Illinois": "IL", "Indiana": "IN", "Michigan": "MI",
    "Ohio": "OH", "Wisconsin": "WI", "Iowa": "IA", "Kansas": "KS", "Minnesota": "MN",
    "Missouri": "MO", "Nebraska": "NE", "North Dakota": "ND", "South Dakota": "SD",
    "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA",
    "Maryland": "MD", "North Carolina": "NC", "South Carolina": "SC", "Virginia": "VA",
    "West Virginia": "WV", "Alabama": "AL", "Kentucky": "KY", "Mississippi": "MS",
    "Tennessee": "TN", "Arkansas": "AR", "Louisiana": "LA", "Oklahoma": "OK",
    "Texas": "TX", "Arizona": "AZ", "Colorado": "CO", "Idaho": "ID", "Montana": "MT",
    "Nevada": "NV", "New Mexico": "NM", "Utah": "UT", "Wyoming": "WY", "Alaska": "AK",
    "California": "CA", "Hawaii": "HI", "Oregon": "OR", "Washington": "WA",
}

CENSUS_REGION = {
    **{s: "northeast" for s in "CT ME MA NH RI VT NJ NY PA".split()},
    **{s: "midwest" for s in "IL IN MI OH WI IA KS MN MO NE ND SD".split()},
    **{s: "south" for s in "DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX".split()},
    **{s: "west" for s in "AZ CO ID MT NV NM UT WY AK CA HI OR WA".split()},
}

CENSUS_REGION_BY_NAME = {
    name: CENSUS_REGION[abbr] for name, abbr in NAME_TO_ABBR.items()
}


# Ordered income brackets exactly as the cumulative file spells them. Anything
# outside this list — "Prefer not to say", "Skipped", "Not Asked" — is missing
# income, NOT a bracket. Relying on categorical order instead would silently
# rank a refusal as though it were a dollar amount.
INCOME_BRACKETS = [
    "Less than 10k", "10k - 20k", "20k - 30k", "30k - 40k", "40k - 50k",
    "50k - 60k", "60k - 70k", "70k - 80k", "80k - 100k", "100k - 120k",
    "120k - 150k", "150k+",
]


def mask(cond) -> np.ndarray:
    """A nullable-boolean comparison as a plain numpy bool array, NA -> False.

    pandas string columns compare to pd.NA rather than False, and numpy raises
    "boolean value of NA is ambiguous" the moment such a mask reaches np.where
    or np.select. Every comparison against survey text goes through here.
    """
    if isinstance(cond, pd.Series):
        return cond.fillna(False).to_numpy(dtype=bool, copy=True)
    return np.asarray(cond, dtype=bool)


def classify(col: pd.Series, rules, default: str | None = None) -> pd.Series:
    """Apply (predicate, label) rules in order; first match wins.

    Rows missing in `col` stay missing — they are never swept into `default`,
    which is the failure mode that turns "did not answer" into a real category
    and quietly biases a coefficient.
    """
    out = pd.Series(pd.NA, index=col.index, dtype="string")
    unassigned = col.notna().to_numpy(dtype=bool, copy=True)
    for predicate, label in rules:
        hit = unassigned & mask(predicate(col))
        out.loc[hit] = label
        unassigned &= ~hit
    if default is not None:
        out.loc[unassigned] = default
    return out


def read_source(path: Path) -> pd.DataFrame:
    """Read the Stata file with value labels resolved to their text."""
    try:
        import pyreadstat  # noqa: PLC0415

        df, _ = pyreadstat.read_dta(
            str(path), usecols=COLUMNS, apply_value_formats=True, formats_as_category=False
        )
        return df
    except ImportError:
        pass
    except Exception as exc:  # pyreadstat is strict about odd label tables
        print(f"  pyreadstat failed ({exc}); falling back to pandas", file=sys.stderr)

    try:
        return pd.read_stata(path, columns=COLUMNS, convert_categoricals=True)
    except ValueError as exc:
        # Stata files with duplicate value labels raise here; the labels are
        # then unusable and the recodes below would silently produce all-NaN.
        raise SystemExit(
            f"could not read value labels ({exc}).\n"
            "Install pyreadstat (`pip install pyreadstat`), which handles this."
        ) from exc


def s(col: pd.Series) -> pd.Series:
    """Value labels as plain strings, whatever the reader handed back."""
    return col.astype("string").str.strip()


def income_quintile(df: pd.DataFrame) -> pd.Series:
    """Trap 1: CES codes income in NOMINAL dollar brackets, top-coded at 150k+.

    Used as-is across cycles, inflation masquerades as a shifting income
    effect. Convert to a within-year population quintile so that "middle" means
    the same position in the distribution in 2008 and in 2024, even though the
    dollars behind it differ.
    """
    rank_of = {label: i for i, label in enumerate(INCOME_BRACKETS)}
    order = s(df["faminc"]).map(rank_of).astype("Float64")
    pct = order.groupby(df["year"]).rank(pct=True, na_option="keep")
    return pd.cut(
        pct.astype(float), [0, 0.2, 0.4, 0.6, 0.8, 1.0],
        labels=["bottom20", "lower_mid", "middle", "upper_mid", "top20"],
        include_lowest=True,
    ).astype("string")


def prepare(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw[raw["year"].isin(CYCLES)].copy()

    # Trap 3: voted_pres_party in a presidential year is THAT year's vote. The
    # voted_pres_08/_12/_16/_20 columns are RECALLED prior votes and carry
    # heavy recall bias toward the eventual winner - never use them as y.
    # Anything not one of the two major parties (third party, refusal, blank)
    # maps to NA and is dropped: the model is two-party by construction.
    df["y"] = s(df["voted_pres_party"]).map(
        {"Democratic": 1.0, "Republican": 0.0}
    ).astype("Float64")

    age = df["year"] - pd.to_numeric(df["birthyr"], errors="coerce")
    df["age"] = pd.cut(age, [-np.inf, 29, 44, 64, np.inf],
                       labels=["18_29", "30_44", "45_64", "65_up"]).astype("string")

    # Trap 4: the binary `gender` item is the only one asked consistently
    # across the whole window. gender4 exists only in recent cycles and cannot
    # be used without breaking comparability.
    df["gender"] = s(df["gender"]).map({"Male": "man", "Female": "woman"}).astype("string")

    # Trap 2: race_h (any-part Hispanic), not raw `race`. The Hispanic
    # follow-up was routed three different ways across the window, so raw race
    # is not comparable between cycles. Maintainers flag race_h as stable.
    df["race"] = classify(s(df["race_h"]), [
        (lambda c: c.str.startswith("White"), "white"),
        (lambda c: c.str.startswith("Black"), "black"),
        (lambda c: c.str.startswith("Hispanic"), "hispanic"),
        (lambda c: c.str.startswith("Asian"), "asian"),
    ], default="other")

    df["educ"] = s(df["educ"]).map({
        "No HS": "no_hs", "High school graduate": "hs", "Some college": "some_college",
        "2-year": "two_year", "4-year": "four_year", "Post-grad": "postgrad",
    }).astype("string")

    df["income"] = income_quintile(df)

    df["marstat"] = classify(s(df["marstat"]), [
        (lambda c: c.str.startswith("Married"), "married"),
    ], default="not_married")

    df["religion"] = classify(s(df["religion"]), [
        (lambda c: c.str.startswith("Protestant"), "protestant"),
        (lambda c: c.str.contains("Catholic"), "catholic"),
        (lambda c: c.str.startswith("Jewish"), "jewish"),
        (lambda c: c.str.startswith("Muslim"), "muslim"),
        (lambda c: c.str.startswith("Nothing in particular"), "nothing"),
        (lambda c: c.str.startswith(("Atheist", "Agnostic")), "none"),
    ], default="other")

    df["bornagain"] = s(df["relig_bornagain"]).map({"Yes": "yes", "No": "no"}).astype("string")
    df["union_hh"] = s(df["union_hh"]).map({"Yes": "yes", "No": "no"}).astype("string")

    st = s(df["st"])
    # The file codes state as an abbreviation, but some readers surface the
    # full name; accept either rather than silently producing an empty region.
    df["region"] = st.map(CENSUS_REGION).fillna(st.map(CENSUS_REGION_BY_NAME)).astype("string")

    # Validated voters where vote validation ran; self-report otherwise.
    if "vv_turnout_gvm" in df:
        vv = s(df["vv_turnout_gvm"])
        df = df[mask(vv.isna()) | mask(vv.str.contains("Voted"))]

    return df


def fit_cycle(df: pd.DataFrame, year: int) -> dict:
    d = df[(df["year"] == year) & df["y"].notna()].dropna(subset=list(FEATURES)).copy()
    if d.empty:
        raise SystemExit(f"{year}: no usable rows - check the recodes against your file")

    for f, levels in FEATURES.items():
        d[f] = pd.Categorical(d[f], categories=levels)

    terms = " + ".join(
        f'C({f}, Treatment(reference="{REFERENCE[f]}"))' for f in FEATURES
    )
    model = smf.glm(
        f"y ~ {terms}", data=d,
        family=__import__("statsmodels.api", fromlist=["families"]).families.Binomial(),
        freq_weights=d["weight"].to_numpy(dtype=float),
    ).fit()
    co = model.params

    w = d["weight"].to_numpy(dtype=float)
    features = []
    for f, levels in FEATURES.items():
        lv = []
        for level in levels:
            term = f'C({f}, Treatment(reference="{REFERENCE[f]}"))[T.{level}]'
            coef = 0.0 if level == REFERENCE[f] else float(co.get(term, 0.0))
            share = float(w[(d[f] == level).to_numpy()].sum() / w.sum())
            lv.append({
                "id": level,
                "label": LABELS[f][level],
                "coef": round(coef, 4),
                "share": round(share, 4),
            })
        features.append({
            "id": f, "label": FEATURE_LABELS[f], "question": QUESTIONS[f], "levels": lv,
        })

    return {
        "year": year,
        "intercept": round(float(co["Intercept"]), 4),
        "features": features,
        "meta": {
            "n": int(len(d)),
            "source": "CES Cumulative Common Content (doi:10.7910/DVN/II2DB6), "
                      f"fitted {date.today().isoformat()}",
            "synthetic": False,
        },
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: python3 scripts/fit_models.py <cumulative_ces.dta>")
    src = Path(sys.argv[1])
    if not src.exists():
        raise SystemExit(f"no such file: {src}")

    print(f"reading {src}")
    df = prepare(read_source(src))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for year in CYCLES:
        model = fit_cycle(df, year)
        path = OUT_DIR / f"{year}.json"
        path.write_text(json.dumps(model, indent=2, ensure_ascii=False) + "\n")
        print(f"{year}: n={model['meta']['n']} -> {path}")

    print("\ndone. run `npm test` then `npm run check`.")


if __name__ == "__main__":
    main()
