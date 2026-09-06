/**
 * Emits placeholder models to data/models/ so the UI and engine can be built
 * and reviewed before the real fit lands (scripts/fit_models.R).
 *
 * These coefficients are INVENTED. They are shaped to be directionally
 * plausible and to carry a visible realignment across cycles — the education
 * and income terms rotate, which is the effect the app exists to show — but no
 * number here is an estimate of anything. Every emitted file carries
 * `meta.synthetic: true` and the UI refuses to hide that.
 *
 * One thing is real: each cycle's intercept is solved so that the electorate
 * mean reproduces that year's actual national two-party result. So the
 * headline number for an "average voter" is right even while the demographic
 * structure underneath it is fabricated.
 *
 *   npm run fixture
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CycleModel, Feature } from '../src/engine/types.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'models');

const CYCLES = [2008, 2012, 2016, 2020, 2024] as const;

/** Verified unweighted CES common-content respondents per cycle. */
const N: Record<number, number> = {
  2008: 32800, 2012: 54535, 2016: 64600, 2020: 61000, 2024: 60000,
};

/**
 * Actual national two-party Democratic share, used only to anchor the
 * intercept. Popular-vote totals, third parties excluded.
 */
const TWO_PARTY_DEM: Record<number, number> = {
  2008: 0.5366, 2012: 0.5198, 2016: 0.5111, 2020: 0.5224, 2024: 0.4923,
};

/** [value in 2008, value in 2024]; intermediate cycles interpolate linearly. */
type Drift = readonly [number, number];
interface LevelSpec { id: string; label: string; coef: Drift; share: Drift }
interface FeatureSpec { id: string; label: string; question: string; levels: LevelSpec[] }

const lerp = (d: Drift, year: number): number =>
  d[0] + (d[1] - d[0]) * ((year - 2008) / (2024 - 2008));

const SPEC: FeatureSpec[] = [
  {
    id: 'gender', label: 'Gender',
    question: 'Are you...?',
    levels: [
      { id: 'man',   label: 'Man',   coef: [0, 0],          share: [0.48, 0.48] },
      { id: 'woman', label: 'Woman', coef: [0.35, 0.45],    share: [0.52, 0.52] },
    ],
  },
  {
    id: 'age', label: 'Age',
    question: 'How old are you?',
    levels: [
      { id: '18_29', label: '18–29', coef: [0.45, 0.55],   share: [0.18, 0.16] },
      { id: '30_44', label: '30–44', coef: [0.20, 0.25],   share: [0.26, 0.25] },
      { id: '45_64', label: '45–64', coef: [0, 0],         share: [0.36, 0.33] },
      { id: '65_up', label: '65+',   coef: [-0.15, -0.10], share: [0.20, 0.26] },
    ],
  },
  {
    id: 'race', label: 'Race or ethnicity',
    question: 'What racial or ethnic group best describes you?',
    levels: [
      { id: 'white',    label: 'White',            coef: [0, 0],       share: [0.76, 0.68] },
      { id: 'black',    label: 'Black',            coef: [2.30, 1.95], share: [0.11, 0.11] },
      { id: 'hispanic', label: 'Hispanic / Latino', coef: [1.15, 0.60], share: [0.08, 0.13] },
      { id: 'asian',    label: 'Asian',            coef: [0.85, 0.75], share: [0.02, 0.04] },
      { id: 'other',    label: 'Other',            coef: [0.55, 0.45], share: [0.03, 0.04] },
    ],
  },
  {
    id: 'educ', label: 'Education',
    question: 'What is the highest level of education you have completed?',
    levels: [
      { id: 'no_hs',        label: 'No high school diploma', coef: [0.15, -0.10], share: [0.05, 0.03] },
      { id: 'hs',           label: 'High school graduate',   coef: [0, 0],        share: [0.30, 0.26] },
      { id: 'some_college', label: 'Some college',           coef: [0.05, 0.10],  share: [0.22, 0.22] },
      { id: 'two_year',     label: '2-year degree',          coef: [0.05, 0.15],  share: [0.09, 0.10] },
      { id: 'four_year',    label: '4-year degree',          coef: [-0.10, 0.45], share: [0.22, 0.25] },
      { id: 'postgrad',     label: 'Postgraduate degree',    coef: [0.15, 0.80],  share: [0.12, 0.14] },
    ],
  },
  {
    id: 'income', label: 'Household income',
    // Percentile, not dollars. CES codes income in nominal brackets, so a
    // dollar-denominated question would make inflation look like a shifting
    // income effect across cycles. See DATA.md, trap 1.
    question: 'Roughly where does your household income sit nationally?',
    levels: [
      { id: 'bottom20',  label: 'Bottom fifth',  coef: [0.30, 0.20],   share: [0.20, 0.20] },
      { id: 'lower_mid', label: 'Lower-middle',  coef: [0.12, 0.08],   share: [0.20, 0.20] },
      { id: 'middle',    label: 'Middle',        coef: [0, 0],         share: [0.20, 0.20] },
      { id: 'upper_mid', label: 'Upper-middle',  coef: [-0.10, 0.02],  share: [0.20, 0.20] },
      { id: 'top20',     label: 'Top fifth',     coef: [-0.20, 0.10],  share: [0.20, 0.20] },
    ],
  },
  {
    id: 'marstat', label: 'Marital status',
    question: 'What is your marital status?',
    levels: [
      { id: 'married',     label: 'Married',     coef: [0, 0],       share: [0.58, 0.52] },
      { id: 'not_married', label: 'Not married', coef: [0.40, 0.45], share: [0.42, 0.48] },
    ],
  },
  {
    id: 'religion', label: 'Religion',
    question: 'What is your present religion, if any?',
    levels: [
      { id: 'protestant', label: 'Protestant',          coef: [0, 0],       share: [0.48, 0.38] },
      { id: 'catholic',   label: 'Catholic',            coef: [0.25, 0.15], share: [0.24, 0.20] },
      { id: 'jewish',     label: 'Jewish',              coef: [0.95, 0.90], share: [0.02, 0.02] },
      { id: 'muslim',     label: 'Muslim',              coef: [1.30, 1.20], share: [0.01, 0.01] },
      { id: 'other',      label: 'Something else',      coef: [0.45, 0.40], share: [0.07, 0.08] },
      { id: 'nothing',    label: 'Nothing in particular', coef: [0.70, 0.85], share: [0.14, 0.22] },
      { id: 'none',       label: 'Atheist or agnostic', coef: [1.05, 1.25], share: [0.04, 0.09] },
    ],
  },
  {
    id: 'bornagain', label: 'Born-again or evangelical',
    question: 'Would you describe yourself as a born-again or evangelical Christian?',
    levels: [
      { id: 'no',  label: 'No',  coef: [0, 0],           share: [0.68, 0.72] },
      { id: 'yes', label: 'Yes', coef: [-0.85, -0.95],   share: [0.32, 0.28] },
    ],
  },
  {
    id: 'union_hh', label: 'Union household',
    question: 'Are you or is anyone in your household a union member?',
    levels: [
      { id: 'no',  label: 'No',  coef: [0, 0],       share: [0.84, 0.88] },
      { id: 'yes', label: 'Yes', coef: [0.35, 0.25], share: [0.16, 0.12] },
    ],
  },
  {
    id: 'region', label: 'Region',
    question: 'Where do you live?',
    levels: [
      { id: 'northeast', label: 'Northeast', coef: [0.30, 0.35],   share: [0.19, 0.17] },
      { id: 'midwest',   label: 'Midwest',   coef: [0, 0],         share: [0.22, 0.21] },
      { id: 'south',     label: 'South',     coef: [-0.20, -0.25], share: [0.37, 0.39] },
      { id: 'west',      label: 'West',      coef: [0.20, 0.30],   share: [0.22, 0.23] },
    ],
  },
];

const round = (x: number, dp = 4): number => Number(x.toFixed(dp));

function buildFeatures(year: number): Feature[] {
  return SPEC.map((f) => {
    const raw = f.levels.map((l) => lerp(l.share, year));
    const total = raw.reduce((a, b) => a + b, 0);
    return {
      id: f.id,
      label: f.label,
      question: f.question,
      // Renormalize: interpolating shares independently does not preserve the
      // sum, and predict() relies on shares summing to 1 per feature.
      levels: f.levels.map((l, i) => ({
        id: l.id,
        label: l.label,
        coef: round(lerp(l.coef, year)),
        share: round(raw[i]! / total),
      })),
    };
  });
}

for (const year of CYCLES) {
  const features = buildFeatures(year);
  const meanTotal = features.reduce(
    (sum, f) => sum + f.levels.reduce((s, l) => s + l.share * l.coef, 0),
    0,
  );
  const target = TWO_PARTY_DEM[year]!;
  const targetLogit = Math.log(target / (1 - target));

  const model: CycleModel = {
    year,
    intercept: round(targetLogit - meanTotal),
    features,
    meta: {
      n: N[year]!,
      source: 'PLACEHOLDER — not fitted. Replace via scripts/fit_models.R.',
      synthetic: true,
    },
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${year}.json`), JSON.stringify(model, null, 2) + '\n');
  console.log(`${year}: intercept ${model.intercept}, baseline ${(target * 100).toFixed(1)}% D`);
}
