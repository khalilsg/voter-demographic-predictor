# Design

Why the code is shaped this way. `README.md` is what it is; `DATA.md` is where
the numbers come from.

## 1. One specification, five fits

The app's only real claim is the shape of the line across cycles. That claim
holds only if the model is identical in every year — same features, same
levels, same reference categories — so that a difference between 2008 and 2024
is a difference in the electorate rather than in the method.

This is load-bearing enough to be a test (`predict.test.ts`, "shares the same
specification across every cycle"), and it is the reason `fit_models.R` builds
every cycle from one `FEATURES` list and one formula. Adding a term for a
single cycle silently converts the headline feature into nonsense.

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

## 6. Open questions

Live review list. When one is resolved, strike it through with what happened
rather than deleting it.

| Call | Why | What to look at later |
|---|---|---|
| No interaction terms | Additive log-odds keeps the waterfall chart exactly truthful; race×education is the obvious first interaction and would break the one-bar-per-question display | Whether a `race × educ` composite feature improves fit enough to justify a composite bar |
| No uncertainty shown | Coefficient standard errors are available from the fit but the UI shows a point estimate | Export `se` alongside `coef` and render a band on the dial and the cycle line |
| Nominal→quintile income recode is rank-based within year | Simple and inflation-proof, but assumes the bracket ordering is comparable across cycles even where bracket boundaries moved | Compare against a CPI-deflated recode on the real data |
| Region derived from state, not urbanicity | Urban/suburban/rural is a stronger predictor than census region and CES has `zipcode`/`county_fips` to derive it | Whether adding a density measure is worth the county-level join |
| Turnout filter falls back to self-report | Vote validation did not run in every cycle, so the sample definition is not perfectly constant across years | Quantify the gap on cycles where both exist |
