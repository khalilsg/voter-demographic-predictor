# voter-demographic-predictor

A toy. Answer ten demographic questions and see how a model fitted on survey
data would have guessed your presidential vote — in 2008, 2012, 2016, 2020 and
2024, all at once.

The point is not the guess. It is the **line across five cycles**: the model
specification never changes, so when your prediction moves between years, that
is the electorate moving, not the method. A white voter with a postgraduate
degree is a different political animal in 2024 than in 2008, and this shows it
about you specifically.

Fitted on 127,578 CES respondents across the five cycles. `npm run check`
validates each fit against reference points whose real values are known; see
[SETUP.md](SETUP.md) to refit, and DESIGN.md section 7 for what the source data
gets wrong (chiefly the under-30 trend in 2024).

## Quick start

```bash
npm install
npm run fixture     # generate placeholder models
npm run dev         # http://localhost:5173
```

```bash
npm test            # engine unit tests
npm run typecheck   # BOTH tsconfigs — tsconfig.json and tsconfig.web.json
npm run build
```

## Two pages

**Predictor** — answer ten questions, see the five-cycle line.
**Coefficients** (`#/coefficients`) — every number the model holds, as tables:
each level's effect in log-odds relative to that cycle's average voter, its
share of the electorate, and the raw regression output. Read a row left to
right and you are looking at a group moving across sixteen years.

## How it works

One logistic regression per cycle, on
[CES cumulative](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/II2DB6)
survey microdata (273k respondents across the five cycles), predicting
two-party Democratic vote from ten demographic terms. See [DATA.md](DATA.md)
for the source, its licensing, and the four harmonization traps that make
cross-cycle comparison possible; [DESIGN.md](DESIGN.md) for why the engine is
shaped the way it is.

Each answer's effect is displayed as a bar in log-odds relative to that cycle's
average voter. Those bars sum **exactly** to the distance between the average
voter and you — the chart is the arithmetic, not an illustration of it. That
identity is asserted in the tests over every level of every feature.

## What it is not

It describes groups of millions, not people. Every group in this data contains
enormous numbers of voters who voted the other way, and the model has no access
to the things that actually decide a vote. Party identification is deliberately
excluded from the specification: it would predict nearly everything and bury
the demographics the app exists to show.

It is a party trick with real data behind it. Treat it as one.

## Fitting the real models

See **[SETUP.md](SETUP.md)** — download, fit, sanity-check, commit.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. The deploy is gated on `npm test` and
`npm run typecheck`, and refuses to publish while `data/models/` still holds
placeholder coefficients.

**The Pages source must be set to GitHub Actions**, once, by hand:

> Settings → Pages → Build and deployment → Source → **GitHub Actions**

If it is set to a branch instead, GitHub runs its own Jekyll build over the
repository root in parallel with this workflow, renders `README.md` as the
homepage, and serves that — while this workflow still reports success, because
it uploaded an artifact nobody reads. The workflow now checks for this and
fails with instructions rather than deploying into the void.

Pages also requires a public repository on free accounts. Nothing sensitive is
published either way: the site is static, and the tracked model files are
aggregate coefficients, never microdata (see [DATA.md](DATA.md)).

## License

Code is [MIT](LICENSE). The survey data underneath is CC0 — see
[DATA.md](DATA.md) for citation.
