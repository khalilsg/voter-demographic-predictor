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

# Actual national two-party Democratic share. Used to calibrate each cycle's
# intercept — see calibrate() for why that is a correction rather than a fudge.
TWO_PARTY_DEM = {
    2008: 0.5366, 2012: 0.5198, 2016: 0.5111, 2020: 0.5224, 2024: 0.4923,
}

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "models"

# Columns pulled from the file. Reading only these keeps a ~1 GB Stata file
# inside a few hundred MB of RAM.
COLUMNS = [
    "year", "case_id", "weight", "weight_post", "voted_pres_party", "vv_turnout_gvm",
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
    "union_hh":  ["never", "former", "current"],
    "region":    ["northeast", "midwest", "south", "west"],
}

# Reference level per feature. Must match the level the engine expects to have
# coefficient exactly 0 (asserted in src/engine/predict.test.ts).
REFERENCE = {
    "gender": "man", "age": "45_64", "race": "white", "educ": "hs",
    "income": "middle", "marstat": "married", "religion": "protestant",
    "bornagain": "no", "union_hh": "never", "region": "midwest",
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
    "union_hh": "Have you or anyone in your household ever belonged to a union?",
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
    "union_hh": {"never": "Never in a union", "former": "In a union before",
                 "current": "In a union now"},
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


def norm(col: pd.Series) -> pd.Series:
    """Lower-cased labels, for matching.

    The 2025 release title-cases labels the codebook writes in sentence case
    ("High School Graduate", "Nothing in Particular"), which silently emptied
    two features. Casing has drifted between releases twice now, so every
    comparison against survey text is case-insensitive and every mapping key
    below is written lower-case.
    """
    return s(col).str.lower()


def income_quintile(df: pd.DataFrame) -> pd.Series:
    """Trap 1: CES codes income in NOMINAL dollar brackets, top-coded at 150k+.

    Used as-is across cycles, inflation masquerades as a shifting income
    effect. Convert to a within-year population quintile so that "middle" means
    the same position in the distribution in 2008 and in 2024, even though the
    dollars behind it differ.
    """
    rank_of = {label.lower(): i for i, label in enumerate(INCOME_BRACKETS)}
    order = norm(df["faminc"]).map(rank_of).astype("Float64")
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
    # "Other", "Third Party" and "Undervote" map to NA and drop out: the model
    # is two-party by construction.
    df["y"] = norm(df["voted_pres_party"]).map(
        {"democratic": 1.0, "republican": 0.0}
    ).astype("Float64")

    age = df["year"] - pd.to_numeric(df["birthyr"], errors="coerce")
    df["age"] = pd.cut(age, [-np.inf, 29, 44, 64, np.inf],
                       labels=["18_29", "30_44", "45_64", "65_up"]).astype("string")

    # Trap 4: the binary `gender` item is the only one asked consistently
    # across the whole window. gender4 exists only in recent cycles and cannot
    # be used without breaking comparability.
    df["gender"] = norm(df["gender"]).map({"male": "man", "female": "woman"}).astype("string")

    # Trap 2: race_h (any-part Hispanic), not raw `race`. The Hispanic
    # follow-up was routed three different ways across the window, so raw race
    # is not comparable between cycles. Maintainers flag race_h as stable.
    # "Mixed", "Native American" and "Middle Eastern" fall to "other".
    df["race"] = classify(norm(df["race_h"]), [
        (lambda c: c.str.startswith("white"), "white"),
        (lambda c: c.str.startswith("black"), "black"),
        (lambda c: c.str.startswith("hispanic"), "hispanic"),
        (lambda c: c.str.startswith("asian"), "asian"),
    ], default="other")

    df["educ"] = norm(df["educ"]).map({
        "no hs": "no_hs", "high school graduate": "hs", "some college": "some_college",
        "2-year": "two_year", "4-year": "four_year", "post-grad": "postgrad",
    }).astype("string")

    df["income"] = income_quintile(df)

    df["marstat"] = classify(norm(df["marstat"]), [
        (lambda c: c.str.startswith("married"), "married"),
    ], default="not_married")

    # "Mormon", "Eastern or Greek Orthodox", "Buddhist", "Hindu" and
    # "Something Else" all fall to "other".
    df["religion"] = classify(norm(df["religion"]), [
        (lambda c: c.str.startswith("protestant"), "protestant"),
        (lambda c: c.str.contains("catholic"), "catholic"),
        (lambda c: c.str.startswith("jewish"), "jewish"),
        (lambda c: c.str.startswith("muslim"), "muslim"),
        (lambda c: c.str.startswith("nothing in particular"), "nothing"),
        (lambda c: c.str.startswith(("atheist", "agnostic")), "none"),
    ], default="other")

    df["bornagain"] = norm(df["relig_bornagain"]).map({"yes": "yes", "no": "no"}).astype("string")

    # The file records current, former and never separately. "Not Sure" is not
    # a fourth position, it is a non-answer, so it maps to missing.
    df["union_hh"] = norm(df["union_hh"]).map({
        "yes, currently": "current", "yes, formerly": "former", "no, never": "never",
    }).astype("string")

    st = s(df["st"])
    # The file codes state as an abbreviation, but some readers surface the
    # full name; accept either rather than silently producing an empty region.
    df["region"] = (st.str.upper().map(CENSUS_REGION)
                    .fillna(st.str.title().map(CENSUS_REGION_BY_NAME)).astype("string"))

    # voted_pres_party comes from the POST-election wave, so it must be
    # weighted with the post-election weight. `weight` is the pre-election
    # weight and does not correct for differential post-wave attrition, which
    # is not random. weight_post exists only for some even years, so fall back.
    post = pd.to_numeric(df.get("weight_post"), errors="coerce") if "weight_post" in df else None
    base = pd.to_numeric(df["weight"], errors="coerce")
    df["fitweight"] = base if post is None else post.fillna(base)
    df = df[df["fitweight"].notna() & (df["fitweight"] > 0)]

    # Validated voters where vote validation ran; self-report otherwise.
    # "No Record of Voting" and "No Voter File" are validated non-voters.
    if "vv_turnout_gvm" in df:
        vv = norm(df["vv_turnout_gvm"])
        df = df[mask(vv.isna()) | mask(vv == "voted")]

    return df


MIN_COVERAGE = 0.01
"""A feature answered by less than this share of a cycle is treated as absent
from it. Not a tuning knob: a question the cycle never asked sits at exactly
zero, and one that was asked sits far above 1%. The threshold only absorbs the
handful of stray values a merge artifact can leave behind."""


def availability(df: pd.DataFrame) -> dict[int, list[str]]:
    """Which features each cycle can actually be fitted on.

    Not every question was asked in every wave — union membership is absent
    from 2008 — and the honest response is neither to drop the feature for all
    cycles nor to score a cycle on a model missing a term. Each cycle is fitted
    on what it carries, and a cycle that cannot represent an answer the user
    gave is later excluded from the comparison rather than shown alongside
    cycles that can. See DESIGN.md section 1.
    """
    out: dict[int, list[str]] = {}
    for year in CYCLES:
        pool = df[(df["year"] == year) & df["y"].notna()]
        out[year] = [f for f in FEATURES if len(pool) and pool[f].notna().mean() > MIN_COVERAGE]
    return out


def report_availability(avail: dict[int, list[str]]) -> None:
    """Say up front what is missing where, rather than one cycle at a time."""
    absent = {f: [y for y in CYCLES if f not in avail[y]] for f in FEATURES}
    absent = {f: years for f, years in absent.items() if years}
    if not absent:
        return
    print("\n  Features not available in every cycle:")
    for f, years in absent.items():
        print(f"    {f:<12} absent from {', '.join(str(y) for y in years)}")
    print("  Those cycles are fitted without it, and the app will exclude them")
    print("  from the comparison when that question is answered.\n")


def fit_cycle(df: pd.DataFrame, year: int, features: list[str]) -> dict:
    pool = df[(df["year"] == year) & df["y"].notna()]
    d = pool.dropna(subset=features).copy()
    if d.empty:
        lines = [f"{year}: no usable rows after dropping incomplete answers.", ""]
        lines.append(f"  rows in cycle with a two-party vote: {len(pool):,}")
        if len(pool):
            lines.append("  missing per feature:")
            for f in features:
                lines.append(f"    {f:<12}{pool[f].isna().mean():>7.1%}")
        lines += ["", "  Run:  python3 scripts/inspect-labels.py <your file>"]
        raise SystemExit("\n".join(lines))

    for f in features:
        d[f] = pd.Categorical(d[f], categories=FEATURES[f])

    terms = " + ".join(
        f'C({f}, Treatment(reference="{REFERENCE[f]}"))' for f in features
    )
    model = smf.glm(
        f"y ~ {terms}", data=d,
        family=__import__("statsmodels.api", fromlist=["families"]).families.Binomial(),
        freq_weights=d["fitweight"].to_numpy(dtype=float),
    ).fit()
    co = model.params

    w = d["fitweight"].to_numpy(dtype=float)
    out_features = []
    for f in features:
        lv = []
        for level in FEATURES[f]:
            term = f'C({f}, Treatment(reference="{REFERENCE[f]}"))[T.{level}]'
            coef = 0.0 if level == REFERENCE[f] else float(co.get(term, 0.0))
            share = float(w[(d[f] == level).to_numpy()].sum() / w.sum())
            lv.append({
                "id": level,
                "label": LABELS[f][level],
                "coef": round(coef, 4),
                "share": round(share, 4),
            })
        out_features.append({
            "id": f, "label": FEATURE_LABELS[f], "question": QUESTIONS[f], "levels": lv,
        })

    return {
        "year": year,
        "intercept": round(float(co["Intercept"]), 4),
        "features": out_features,
        "meta": {
            "n": int(len(d)),
            "source": "CES Cumulative Common Content (doi:10.7910/DVN/II2DB6), "
                      f"fitted {date.today().isoformat()}",
            "synthetic": False,
        },
    }


def observed_groups(d: pd.DataFrame) -> dict[str, tuple[float, int]]:
    """Weighted two-party Democratic share for a few groups, straight from the
    data — no model involved.

    This is the number a published crosstab reports: an average over the group
    as it actually is. `npm run check` cannot compute it, because from
    coefficients alone the best it can do is "someone Black who is average on
    every other question", and a group is not average on every other question.
    The two figures differ for real reasons, so comparing the model's
    conditional against a published marginal invites chasing a discrepancy that
    is not an error.

    Printed at fit time to validate the RECODES: if the Hispanic or born-again
    mapping silently matched the wrong rows, it shows up here first.
    """
    def share(m: np.ndarray) -> tuple[float, int]:
        sub = d[m]
        if sub.empty:
            return (float("nan"), 0)
        w = sub["fitweight"].to_numpy(dtype=float)
        return (float((sub["y"].to_numpy(dtype=float) * w).sum() / w.sum()), len(sub))

    race = d["race"].to_numpy()
    educ = d["educ"].to_numpy()
    degree = np.isin(educ, ["four_year", "postgrad"])
    return {
        "Black": share(race == "black"),
        "Hispanic": share(race == "hispanic"),
        "White, degree": share((race == "white") & degree),
        "White, no degree": share((race == "white") & ~degree),
        "White evangelical": share((race == "white") & (d["bornagain"].to_numpy() == "yes")),
        "Women": share(d["gender"].to_numpy() == "woman"),
        "Under 30": share(d["age"].to_numpy() == "18_29"),
    }


def calibrate(model: dict) -> dict:
    """Shift a cycle's intercept so its average voter matches that election.

    The CES overstates the Democratic share of the reported presidential vote —
    online panels skew toward the winner, and the sample is weighted to adults
    rather than to actual voters. That much is expected and mostly harmless
    here, because the app displays contributions RELATIVE to each cycle's
    average voter.

    What is not harmless is that the skew VARIES by cycle: on this file, +5.7
    points in 2008 down to +1.6 in 2024. Left alone, that 4-point spread enters
    the cross-cycle line as movement, and a reader cannot tell it from real
    realignment — precisely the confound the whole project is built to avoid.

    So the level comes from the election and the structure comes from the
    survey. Only the intercept moves; every demographic coefficient is the
    fitted one, untouched. The pre-calibration value is kept in meta so the
    raw fit stays inspectable, and `npm run check` reports it.
    """
    mean_total = sum(
        sum(l["share"] * l["coef"] for l in f["levels"]) for f in model["features"]
    )
    target = TWO_PARTY_DEM[model["year"]]
    target_logit = np.log(target / (1 - target))

    model["meta"]["raw_intercept"] = model["intercept"]
    model["meta"]["raw_baseline"] = round(
        float(1 / (1 + np.exp(-(model["intercept"] + mean_total)))), 4
    )
    model["meta"]["calibrated_to"] = target
    model["intercept"] = round(float(target_logit - mean_total), 4)
    return model


def main() -> None:
    argv = [a for a in sys.argv[1:] if a != "--no-calibrate"]
    do_calibrate = "--no-calibrate" not in sys.argv
    if not argv:
        raise SystemExit("usage: python3 scripts/fit_models.py <cumulative_ces.dta>")
    src = Path(argv[0])
    if not src.exists():
        raise SystemExit(f"no such file: {src}")

    print(f"reading {src}")
    df = prepare(read_source(src))
    avail = availability(df)
    report_availability(avail)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    observed: dict[int, dict[str, tuple[float, int]]] = {}

    for year in CYCLES:
        d = df[(df["year"] == year) & df["y"].notna()].dropna(subset=avail[year])
        observed[year] = observed_groups(d)
        model = fit_cycle(df, year, avail[year])
        if do_calibrate:
            model = calibrate(model)
        path = OUT_DIR / f"{year}.json"
        path.write_text(json.dumps(model, indent=2, ensure_ascii=False) + "\n")
        omitted = [f for f in FEATURES if f not in avail[year]]
        note = f"  (without {', '.join(omitted)})" if omitted else ""
        raw = model["meta"].get("raw_baseline")
        skew = (f"  survey {raw * 100:.1f}% D -> calibrated "
                f"{TWO_PARTY_DEM[year] * 100:.1f}%") if raw is not None else ""
        print(f"{year}: n={model['meta']['n']} -> {path}{note}{skew}")

    # Observed group shares, straight from the data. These validate the
    # recodes; `npm run check` validates the engine. They measure different
    # things - see observed_groups().
    print("\nObserved two-party Democratic share by group (from the data, unmodelled):")
    groups = list(next(iter(observed.values())).keys())
    header = "  " + "group".ljust(20) + "".join(str(y).rjust(9) for y in CYCLES)
    print(header)
    print("  " + "-" * (len(header) - 2))
    for g in groups:
        cells = ""
        for year in CYCLES:
            value, count = observed[year][g]
            cells += (f"{value * 100:.0f}%" if count else "--").rjust(9)
        print("  " + g.ljust(20) + cells)
    print("\n  Reference (Edison exit polls, two-party): Black ~90-96%,")
    print("  Hispanic ~57-71% and falling since 2016, white evangelical ~16-24%,")
    print("  white no degree ~30-37%. A group far outside its band means the")
    print("  recode for it is wrong; run scripts/inspect-labels.py.")

    print("\ndone. run `npm test` then `npm run check`.")


if __name__ == "__main__":
    main()
