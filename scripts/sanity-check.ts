/**
 * Prints each cycle's model against reference points whose real values are
 * well known, so a silently wrong recode shows up as an implausible number
 * rather than as a plausible-looking app.
 *
 * The unit tests check internal consistency — shares summing to 1, reference
 * levels, the contribution identity. They cannot tell you the model is about
 * the right *world*. That is what this is for. Run it after every fit.
 *
 *   npm run check
 */
import { MODELS } from '../src/engine/models.js';
import { baselineLogit, invLogit, predict } from '../src/engine/predict.js';

/** Actual national two-party Democratic share, for comparison. */
const ACTUAL: Record<number, number> = {
  2008: 53.7, 2012: 52.0, 2016: 51.1, 2020: 52.2, 2024: 49.2,
};

const p = (answers: Record<string, string>, m: (typeof MODELS)[number]) =>
  predict(m, answers).p * 100;

const row = (s: string, w: number) => s.padEnd(w);
const num = (x: number, w: number) => x.toFixed(0).padStart(w);

console.log();
console.log(
  row('cycle', 7) + row('avg voter', 22) + row('Black', 8) +
  row('wht evang', 11) + row('Hispanic', 10) + row('n', 9) + 'fitted',
);
console.log('-'.repeat(74));

let warnings: string[] = [];

for (const m of MODELS) {
  const base = invLogit(baselineLogit(m)) * 100;
  const drift = base - (ACTUAL[m.year] ?? base);
  const black = p({ race: 'black' }, m);
  const evan = p({ race: 'white', bornagain: 'yes' }, m);
  const hisp = p({ race: 'hispanic' }, m);

  console.log(
    row(String(m.year), 7) +
    row(`${base.toFixed(1)}% D (real ${ACTUAL[m.year]?.toFixed(1)}%)`, 22) +
    num(black, 4) + '%   ' +
    num(evan, 6) + '%    ' +
    num(hisp, 5) + '%   ' +
    row(m.meta.n.toLocaleString(), 9) +
    (m.meta.synthetic ? 'NO — placeholder' : 'yes'),
  );

  if (Math.abs(drift) > 2) warnings.push(`${m.year}: average voter is ${drift.toFixed(1)} pts off the real result — check weighting and the two-party filter.`);
  if (black < 80) warnings.push(`${m.year}: Black voters at ${black.toFixed(0)}% D looks low (expect ~85-95%) — check the race_h recode, DATA.md trap 2.`);
  if (evan > 35) warnings.push(`${m.year}: white evangelicals at ${evan.toFixed(0)}% D looks high (expect ~15-25%) — check reference levels for a sign error.`);
}

const hispTrend = p({ race: 'hispanic' }, MODELS.at(-1)!) - p({ race: 'hispanic' }, MODELS[2]!);
if (hispTrend > -1) {
  warnings.push(`Hispanic Democratic share did not decline from 2016 to 2024 (${hispTrend.toFixed(1)} pts) — plausible only if the recode is collapsing categories.`);
}

const allFeatures = new Set(MODELS.flatMap((m) => m.features.map((f) => f.id)));
for (const m of MODELS) {
  const missing = [...allFeatures].filter(
    (id) => !m.features.some((f) => f.id === id),
  );
  if (missing.length) {
    console.log(
      `${m.year} fitted without ${missing.join(', ')} — that cycle is excluded ` +
      `from the comparison when the question is answered.`,
    );
  }
}

console.log();
if (MODELS.some((m) => m.meta.synthetic)) {
  console.log('These are PLACEHOLDER coefficients. See SETUP.md to fit the real ones.');
} else if (warnings.length === 0) {
  console.log('All reference points are in the expected range.');
} else {
  console.log('Check these:');
  for (const w of warnings) console.log(`  - ${w}`);
}
console.log();
