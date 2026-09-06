# Design

Why the code is shaped this way. `README.md` is what it is; `DATA.md` is where
the numbers come from.

## 1. One specification — and what to do when a cycle cannot honour it

The app's only real claim is the shape of the line across cycles. That claim
holds only if the model is identical in every year, so that a difference
between 2008 and 2024 is a difference in the electorate rather than in the
method.

The CES does not fully cooperate. Union membership was not asked in 2008. That
leaves three options, and only one of them is honest:

1. **Drop the feature everywhere.** Costs every cycle a real predictor to
   satisfy the weakest one.
2. **Fit 2008 without it and show all five points.** This is the tempting
   option and the wrong one. The 2008 point would come from a nine-term model
   sitting in a chart of ten-term models, and the gap between it and the others
   would be partly the electorate and partly the missing term — with no way for
   a reader to tell which. Precisely the confound this section exists to
   prevent.
3. **Fit each cycle on what it has, and exclude a cycle from the comparison
   when the user answers something it cannot score.**

We do (3). Each cycle's model file contains only the features that cycle
carries; `questions()` returns the union for the UI; `predict()` reports any
answer the cycle has no term for as `unsupported`; `comparable()` drops those
cycles. The user sees the question marked *"Not asked in 2008"* before they
answer and the year drawn as a labelled gap after — never a number that looks
comparable and is not.

The invariant is therefore not "every cycle has the same features" but the
sharper: **where two cycles both carry a feature, it is defined identically**,
and **a cycle is only ever compared against cycles scoring the same answers.**
Both are tested.

The cost is real — answer the union question and you lose the 2008 baseline,
which is a genuinely useful anchor for the realignment story. Making that cost
visible, and the user's choice, is better than hiding it in a footnote or
silently absorbing it into a coefficient.

## 2. Microdata, not published crosstabs

Published exit-poll crosstabs are *marginals*: `P(D | woman)` and `P(D | rural)`
separately, never `P(D | rural woman)`. Reconstructing a joint from marginals
means naive Bayes on the log-odds scale, which is elegant — each crosstab row
becomes `logit(p_group) − logit(p_baseline)` and the group's population share
cancels — but badly overconfident, because correlated traits (rural, white,
non-college, evangelical) each contribute their full shift and compound.
Fixing it means a fitted shrinkage parameter and composite cells, i.e.
approximating a regression with extra steps.

Survey microdata removes the problem instead of managing it. With individual
respondents, an ordinary logistic regression handles the correlation
structure directly. That decision is why the data source mattered so much
(DATA.md) and why the engine is as simple as it is.

## 3. Contributions are centered on the electorate, not on a reference level

Raw logistic coefficients are relative to an arbitrary reference category
("relative to a married white man with a high-school diploma"), which is both
uninterpretable to a user and a bad look. So `predict()` subtracts each
feature's share-weighted mean coefficient, giving a push relative to *the
average voter of that cycle*.

This makes the waterfall chart honest in a specific way:

```
logitP === baselineLogit + sum(contributions)
```

exactly, not approximately. The bars are the computation. `predict.test.ts`
asserts this over every level of every feature in every cycle.

It also gives "no answers at all" a meaningful result — the cycle's average
voter — and lets an unanswered question contribute its mean rather than
forcing a guess or dropping the term.

## 4. Party ID is excluded on purpose

`pid3` is in the source data and would dominate every other term, pushing
predictions to the high 90s and flattening every demographic bar to invisible.
The app is about demographics. Including party identification would make it
more accurate and completely pointless.

## 5. The engine refuses to be confidently wrong about people

Choices that bias toward under-claiming:

- An unknown level id is treated as unanswered rather than throwing, so a saved
  answer set still loads after a recode.
- `meta.synthetic` propagates from the model files to a UI banner. An
  unlabelled fabricated number about an election is the one output this project
  must never produce, so the flag lives in the data rather than in a build
  constant someone can forget to flip.
- The prose in the UI states the group-versus-individual limitation in the
  header, not in a footnote.

## 6. The level comes from the election, the structure from the survey

The CES overstates the Democratic share of the reported presidential vote.
Online panels skew toward the winner, respondents misremember, and the sample
is weighted to adults rather than to the people who actually voted. On the real
file the fitted average voter lands 1.6 to 5.7 points more Democratic than the
election did.

Most of that would be harmless. The app displays contributions *relative* to
each cycle's average voter, so a constant offset cancels out of everything the
waterfall shows.

The problem is that the skew is not constant. A 4-point spread across cycles
enters the year-over-year line as movement, and no reader can distinguish it
from realignment — which is the one thing this chart is supposed to show. It is
the same confound as section 1, arriving by a different route.

So each cycle's intercept is shifted to make its average voter reproduce that
election's actual two-party result, and nothing else is touched. Every
demographic coefficient is the fitted one. `meta.raw_intercept` and
`meta.raw_baseline` preserve what the survey alone said, `npm run check`
displays it beside the calibrated figure, and `--no-calibrate` turns the step
off for anyone who wants the unadjusted fit.

This is post-stratification to a known margin, not a thumb on the scale: the
election result is a census of the quantity being estimated, and it is
better evidence of the national level than any survey. What the survey is
uniquely good at — how groups differ from each other — is exactly what is
left alone.

## 7. Open questions

Live review list. When one is resolved, strike it through with what happened
rather than deleting it.

| Call | Why | What to look at later |
|---|---|---|
| ~~No uncertainty shown~~ **Resolved.** The fit now emits the coefficient covariance and the app shows a 95% interval on the dial and a band on the cycle line. Standard errors alone would have been wrong: what is displayed is a contrast (coefficient minus feature mean), so the terms are correlated by construction and c'Vc is the correct variance. The interval excludes the intercept, which after calibration carries an election result rather than an estimate | | |
| ~~Region derived from state, not urbanicity~~ **Resolved.** Urbanicity added from county FIPS via USDA RUCC. It is metro size rather than city-versus-suburb, which is the honest ceiling at county resolution | | |
| No interaction terms | Additive log-odds keeps the waterfall chart exactly truthful; race×education is the obvious first interaction and would break the one-bar-per-question display | Whether a `race × educ` composite feature improves fit enough to justify a composite bar |
| Nominal→quintile income recode is rank-based within year | Simple and inflation-proof, but assumes the bracket ordering is comparable across cycles even where bracket boundaries moved | Compare against a CPI-deflated recode on the real data |
| Turnout filter falls back to self-report | Vote validation did not run in every cycle, so the sample definition is not perfectly constant across years | Quantify the gap on cycles where both exist |
| Union membership costs the 2008 cycle | Section 1: 2008 never asked it, and excluding the cycle beats scoring it on a different model | Whether the cumulative file's separate `union` (own membership) variable covers 2008, which would restore the cycle |
| A cycle is excluded outright rather than shown with a wider band | Excluding is unambiguous; a band would need a defensible width and invites reading the point as comparable anyway | Revisit if more questions turn out to be partially available and the chart starts losing several cycles at once |
| Calibration shifts only the intercept | Section 6: a uniform shift is the minimal correction that removes the differential skew without touching what the survey measures well | Whether raking the sample to known turnout margins by race and education would beat a single shift, which would also fix group-level skew |
| Raking targets are unfilled | The mechanism is built and verified — it hits a target exactly while preserving each band's total weight — but `turnout_targets.json` ships empty, because the numbers need exit-poll crosstabs | Fill it from Edison or AP VoteCast and refit; the under-30 row below should then close |
| Under-30 Democratic share rises through 2024, when the electorate moved the other way | Opt-in online panels miss the 2024 youth shift; the CES under-30 cell runs ~11 points Democratic in 2024 against the exit polls, and weighting does not recover it. Correcting one group toward a prior is a thumb on the scale, unlike the uniform intercept shift in section 6 | Whether raking the sample to known turnout by age closes it; failing that, whether the age term should carry a visible caveat in the UI |
| Black Democratic share reads high in `npm run check` | That figure is a conditional — a Black voter average on every other question — not the published marginal, and an additive model with no race x education interaction puts it above one by construction | The unmodelled group table from `fit_models.py` is the like-for-like comparison; if that also reads high, the cause is panel skew and a race x education interaction is the fix |
