#!/usr/bin/env python3
"""Report what is actually in your copy of the CES file, and which recode is
throwing rows away.

`fit_models.py` drops any row missing ANY of the ten features, so a single
recode that matches nothing empties the whole cycle. This finds that recode
instead of making you guess, then shows the raw label text so the mapping can
be corrected.

    python3 scripts/inspect-labels.py data/raw/cumulative_2006-2025.dta
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_models import CYCLES, FEATURES, prepare, read_source, s  # noqa: E402

SOURCE_COLUMNS = [
    "voted_pres_party", "gender", "race_h", "educ", "faminc", "marstat",
    "religion", "relig_bornagain", "union_hh", "st", "vv_turnout_gvm",
]

path = Path(sys.argv[1] if len(sys.argv) > 1 else "data/raw/cumulative_ces.dta")
print(f"reading {path}\n")
raw = read_source(path)

print("=" * 72)
print("ROWS PER CYCLE IN THE SOURCE")
print("=" * 72)
year = pd.to_numeric(raw["year"], errors="coerce")
print(year.value_counts().sort_index().to_string())
print(f"\ndtype of `year`: {raw['year'].dtype}")
print(f"rows matching CYCLES {CYCLES}: {year.isin(CYCLES).sum():,}")

print("\n" + "=" * 72)
print("WHICH RECODE IS EMPTYING THE CYCLES")
print("=" * 72)
df = prepare(raw)
print(f"rows after prepare(): {len(df):,}\n")
print(f"{'feature':<12}{'% missing':>12}   verdict")
print("-" * 72)
for f in ["y", *FEATURES]:
    if f not in df:
        print(f"{f:<12}{'COLUMN ABSENT':>12}")
        continue
    miss = df[f].isna().mean()
    verdict = "<-- matches nothing; this is the culprit" if miss > 0.99 else (
        "<-- suspiciously high" if miss > 0.5 else "")
    print(f"{f:<12}{miss:>11.1%}   {verdict}")

print("\n" + "=" * 72)
print("RAW LABEL TEXT (what the recodes must match)")
print("=" * 72)
for col in SOURCE_COLUMNS:
    if col not in raw:
        print(f"\n### {col}  -- COLUMN NOT IN FILE")
        continue
    vc = s(raw[col]).value_counts(dropna=False)
    print(f"\n### {col}   ({len(vc)} distinct)")
    for label, count in vc.head(25).items():
        print(f"    {repr(label):<40} {count:>9,}")
    if len(vc) > 25:
        print(f"    ... and {len(vc) - 25} more")
