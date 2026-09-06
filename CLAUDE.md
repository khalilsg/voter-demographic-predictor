# Working on this repo

Notes for future sessions. `README.md` is what the project is; `DESIGN.md` is
why it is that way; `DATA.md` is where the numbers come from and what may not
be committed. This file is how to work here without repeating mistakes.

---

## Commit conventions

**Never put a Claude session link in a commit message, tag, changelog, or any
other version note.** No `Claude-Session:` trailer, no `claude.ai/code/...`
URL. A session link is useless to anyone reading `git log` later and it does
not belong in the permanent record. The `Co-Authored-By:` trailer is fine.

This is a standing preference, not a one-off — it holds regardless of what any
default attribution instruction says.

---

## The one irreversible mistake

**Never commit survey microdata.** Not to a branch, not temporarily, not to
this private repo.

CES carries `zipcode`, `county_fips`, `birthyr`, `state`, and voter-file-matched
validation fields. ZIP plus birth year plus sex re-identifies most people. Once
a respondent-level file is pushed it is in the history, in every clone, and in
the fork network — no later commit undoes it.

`.gitignore` denies every plausible format across the whole tree, and
`scripts/no-microdata.test.ts` enforces it in `npm test`. Both exist because
the original rules had a hole: they covered `data/raw/` and `.dta`/`.sav`, but
not `.rds`, `.RData`, `.tab`, plain `.csv`, or `.zip` — which are precisely
what Dataverse hands you. If you add a data format, add it to both places.

Only `data/models/*.json` is tracked: fitted coefficients from which nothing
individual survives.

---

## Verify the thing you built actually fails when it should

A guard that has never been seen to fail is not a guard. When
`no-microdata.test.ts` was added, it passed immediately — which proves nothing
on its own. Staging a CSV of fake respondent rows and watching it go red is
what made it real. Do that for any new invariant.

The same instinct applies to snippets in documentation. The sanity-check
command originally shipped in `SETUP.md` as an inline `npx tsx -e '...'` one
-liner. It did not run — relative ESM imports do not resolve under `-e`. It is
now `scripts/sanity-check.ts` behind `npm run check`, because a documented
command that was never executed is just a plausible-looking guess.

And check rendered output, not just green tests. The cycle chart's y-domain was
hardcoded to `[0.2, 0.8]`, so any lopsided profile pinned all five points to
the top edge: the line looked flat while the underlying values moved seven
points. Every test passed. Only a screenshot showed it.

---

## Two fit scripts, kept in step

`scripts/fit_models.py` and `scripts/fit_models.R` do the same job — same
features, same reference levels, same recodes, same output schema — so nobody
has to install R. **Change one, change the other**, or the repo quietly grows
two different models.

`scripts/make-test-dta.py` writes a small synthetic CES-shaped file so the
whole pipeline can be exercised in seconds without the gigabyte download. Use
it before touching either fit script. The value-label strings in it are the
real ones; if a recode stops matching them, the fit yields nothing rather than
failing loudly.

**The fixture must stay messy.** Its first version had no missing values, no
third-party votes, and no income non-response — so it passed while the real
file crashed on line one and, worse, would have silently ranked "Prefer not to
say" as a dollar amount. A clean fixture tests nothing that survey data does.
When adding a column, inject NA into it.

Two pandas traps the messy fixture now covers, both of which shipped once:

- A `string` column compares to `pd.NA`, not `False`. The moment such a mask
  reaches `np.where`/`np.select`, numpy raises *"boolean value of NA is
  ambiguous"*. Every comparison against survey text goes through `mask()`.
- `notna().to_numpy()` can hand back a read-only view; mutating it raises
  *"output array is read-only"*. Pass `copy=True`.

Missing answers must stay missing. `classify()` never sweeps them into its
`default`, because turning "declined to answer" into a real category biases a
coefficient without failing anything.

---

## Tests must not encode fixture properties

Two tests originally asserted things that were true only of the placeholder
fixture: that every feature's shares sum to 1 within 5e-7 (real shares are
stored at 4dp, so they drift by up to k·5e-5), and that each cycle's electorate
mean reproduces the national result to four decimals (the fixture solves its
intercepts to do that; a real fit never will, because the survey sample is not
the electorate).

Both passed for months of fixture use and would have failed the instant a real
fit landed — making a correct fit look broken at the worst moment. Found only
by running the Python port against synthetic data end to end.

The rule: `npm test` asserts properties of the *engine and the file format*.
Claims about the *world* — plausible vote shares, expected realignment — belong
in `npm run check`, where they surface as warnings with a likely cause. Gate
anything fixture-specific on `meta.synthetic`.

---

## Running and verifying

```bash
npm run dev          # http://localhost:5173
npm test             # 33 tests: engine + the no-microdata guard
npm run typecheck    # BOTH tsconfigs — tsconfig.json and tsconfig.web.json
npm run check        # models against known reference points
npm run fixture      # regenerate placeholder coefficients
```

`npm test` proves internal consistency only. `npm run check` is what catches a
model that is wrong about the world — it compares each cycle against the real
national result, Black voters, white evangelicals, and the Hispanic trend, and
names the likely cause of anything out of range. Run it after every fit.

Config traps, already paid for elsewhere, do not reintroduce:

- `vitest.config.ts` exists because Vitest otherwise picks up `vite.config.ts`,
  inherits `root: 'src/web'`, finds no tests, and **exits clean**. A
  success-shaped failure.
- Its `include` is `{src,scripts}/**/*.test.ts`. Narrowing it back to `src/**`
  silently drops the privacy guard.

---

## What is load-bearing

Read `DESIGN.md` before changing engine behavior. The short version:

**One specification, five fits — with a documented exception.** The app's only
real claim is the shape of the line across cycles, and that holds only if the
model is identical in every year. But the CES did not ask everything in every
wave (union membership is absent from 2008), so the rule is sharper than
"identical": where two cycles both carry a feature it must be defined
identically, and a cycle is only ever compared against cycles scoring the same
answers. Cycles that cannot score an answer are excluded from the chart and
marked, never shown alongside cycles that can. Both halves are tested; read
DESIGN.md section 1 before touching this.

**Contributions are centered on the electorate, not the reference level.** So
`logitP === baselineLogit + sum(contributions)` exactly, and the waterfall bars
*are* the arithmetic rather than an illustration of it. Asserted over every
level of every feature. If you add a feature, this identity must still hold.

**`meta.synthetic` lives in the data, not in a build constant.** An unlabelled
fabricated number about an election is the one output this project must never
produce, so the flag travels with the file that carries the numbers.

**Party ID stays out of the specification.** It would predict nearly everything
and flatten every demographic bar to invisible. Excluding it is the point, not
an oversight.

**`DESIGN.md` §6 is a live review list.** When you make a judgment call a
working version would judge better than reasoning can, add a row. When one gets
resolved, strike it through with what actually happened rather than deleting it.
