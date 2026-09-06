import type {
  Answers,
  Contribution,
  CycleModel,
  Feature,
  Prediction,
  Question,
  ReferenceGroup,
} from './types.js';

export const logit = (p: number): number => Math.log(p / (1 - p));
export const invLogit = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Share-weighted mean coefficient of a feature: the contribution of a voter
 * who is "average" on this question. Subtracting it from a level's raw
 * coefficient removes the arbitrary reference level, so contributions become
 * comparable across features and across cycles.
 */
function meanCoef(feature: Feature): number {
  return feature.levels.reduce((sum, l) => sum + l.share * l.coef, 0);
}

/**
 * Share-weighted mean coefficient of one feature in one cycle, or undefined if
 * that cycle does not carry the feature.
 *
 * Exported so the coefficients page can show the same centered numbers the
 * waterfall does, rather than re-deriving the centering and drifting from it.
 */
export function featureMean(
  model: CycleModel,
  featureId: string,
): number | undefined {
  const f = model.features.find((x) => x.id === featureId);
  return f ? meanCoef(f) : undefined;
}

/**
 * A level's effect relative to that cycle's average voter, in log-odds — the
 * quantity the contribution bars show. Undefined when the cycle lacks the
 * feature or the level.
 */
export function centeredCoef(
  model: CycleModel,
  featureId: string,
  levelId: string,
): number | undefined {
  const f = model.features.find((x) => x.id === featureId);
  const l = f?.levels.find((x) => x.id === levelId);
  if (!f || !l) return undefined;
  return l.coef - meanCoef(f);
}

/** Log-odds of the cycle's average voter, averaging over every question. */
export function baselineLogit(model: CycleModel): number {
  return model.features.reduce((sum, f) => sum + meanCoef(f), model.intercept);
}

/**
 * Standard error of the displacement from the cycle baseline.
 *
 * What the app shows for each answer is a contrast — the level's coefficient
 * minus its feature's share-weighted mean — so the displayed total is
 *
 *     Σ_f ( β_chosen(f) − Σ_j share_j β_j(f) )
 *
 * a linear combination of correlated estimates. Building the contrast vector c
 * and evaluating c'Vc gives its variance exactly, where summing per-term
 * standard errors would not. An unanswered feature contributes its own mean
 * minus itself, i.e. nothing, which falls out of the same construction.
 *
 * Undefined when the model predates the covariance being emitted.
 */
export function displacementSe(
  model: CycleModel,
  answers: Answers,
): number | undefined {
  const cov = model.covariance;
  if (!cov) return undefined;

  const c = new Array<number>(cov.terms.length).fill(0);
  const at = (featureId: string, levelId: string) =>
    cov.terms.indexOf(`${featureId}.${levelId}`);

  for (const feature of model.features) {
    const levelId = answers[feature.id];
    if (!levelId || !feature.levels.some((l) => l.id === levelId)) continue;

    const chosen = at(feature.id, levelId);
    if (chosen >= 0) c[chosen]! += 1; // a reference level has no term: it is 0

    for (const l of feature.levels) {
      const i = at(feature.id, l.id);
      if (i >= 0) c[i]! -= l.share;
    }
  }

  let variance = 0;
  for (let i = 0; i < c.length; i++) {
    if (c[i] === 0) continue;
    for (let j = 0; j < c.length; j++) {
      if (c[j] === 0) continue;
      variance += c[i]! * c[j]! * cov.values[i]![j]!;
    }
  }
  // Numerical noise can push a near-zero variance slightly negative.
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Predict the two-party Democratic vote probability for one set of answers
 * under one cycle's model.
 *
 * An unanswered question contributes its electorate mean, i.e. zero push. That
 * is the honest default: it neither invents an answer nor drops the question
 * from the intercept, and it keeps the identity below exact.
 *
 * Invariant, asserted in the tests and relied on by the waterfall chart:
 *
 *     logitP === baselineLogit + sum(contributions)
 *
 * The bars in the UI are therefore not an illustration of the arithmetic —
 * they are the arithmetic.
 */
export function predict(model: CycleModel, answers: Answers): Prediction {
  const contributions: Contribution[] = [];
  const unanswered: string[] = [];
  let logitP = model.intercept;

  for (const feature of model.features) {
    const mean = meanCoef(feature);
    const levelId = answers[feature.id];
    const level = levelId
      ? feature.levels.find((l) => l.id === levelId)
      : undefined;

    if (!level) {
      // Unknown ids are treated as unanswered rather than throwing: the UI can
      // load a saved answer set after a question's levels have been recoded.
      unanswered.push(feature.id);
      logitP += mean;
      continue;
    }

    logitP += level.coef;
    contributions.push({
      featureId: feature.id,
      featureLabel: feature.label,
      levelId: level.id,
      levelLabel: level.label,
      logOdds: level.coef - mean,
    });
  }

  // Answers this cycle has no term for. Left unreported, they would simply
  // vanish and the cycle would look comparable to ones that could use them.
  const modeled = new Set(model.features.map((f) => f.id));
  const unsupported = Object.keys(answers).filter(
    (id) => answers[id] !== undefined && !modeled.has(id),
  );

  const se = displacementSe(model, answers);
  // Transform the interval endpoints through the link rather than putting a
  // symmetric band around the probability, which would run past 0 or 1 for
  // lopsided profiles and overstate the width near the middle.
  const interval: [number, number] | undefined =
    se === undefined
      ? undefined
      : [invLogit(logitP - 1.96 * se), invLogit(logitP + 1.96 * se)];

  return {
    year: model.year,
    p: invLogit(logitP),
    logitP,
    baselineLogit: baselineLogit(model),
    contributions,
    unanswered,
    unsupported,
    se,
    interval,
  };
}

/**
 * The question set the UI shows: every feature any cycle carries, annotated
 * with which cycles cannot score it.
 *
 * Ordered by the cycle that has the most features, so the questions appear in
 * the order the specification defines rather than in discovery order.
 */
export function questions(models: CycleModel[]): Question[] {
  const richest = [...models].sort(
    (a, b) => b.features.length - a.features.length,
  )[0];
  if (!richest) return [];

  const ids = new Set<string>();
  const ordered: Feature[] = [];
  for (const m of [richest, ...models]) {
    for (const f of m.features) {
      if (!ids.has(f.id)) {
        ids.add(f.id);
        ordered.push(f);
      }
    }
  }

  return ordered.map((f) => {
    const years = models.filter((m) => m.features.some((x) => x.id === f.id))
      .map((m) => m.year)
      .sort((a, b) => a - b);
    return {
      ...f,
      years,
      missingFrom: models.map((m) => m.year)
        .filter((y) => !years.includes(y))
        .sort((a, b) => a - b),
    };
  });
}

/**
 * The most specific published group the answers fully belong to.
 *
 * Every criterion must hold — this is "a group you are in", not "a group you
 * resemble" — and among those, the one defined by the most criteria wins, with
 * sample size breaking ties. The point is to put one number next to the
 * prediction that no model produced: what this group actually did, straight
 * from the data.
 *
 * Undefined for models fitted before reference groups were emitted, and for
 * answer sets that match nothing.
 */
export function nearestGroup(
  model: CycleModel,
  answers: Answers,
): ReferenceGroup | undefined {
  const matches = (model.reference_groups ?? []).filter((g) =>
    Object.entries(g.criteria).every(([featureId, levels]) => {
      const answer = answers[featureId];
      return answer !== undefined && levels.includes(answer);
    }),
  );
  return matches.sort(
    (a, b) =>
      Object.keys(b.criteria).length - Object.keys(a.criteria).length ||
      b.n - a.n,
  )[0];
}

/** Cycles that can score this answer set — the ones safe to compare. */
export function comparable(predictions: Prediction[]): Prediction[] {
  return predictions.filter((r) => r.unsupported.length === 0);
}

/** The same answers across every cycle — the realignment view. */
export function predictAcrossCycles(
  models: CycleModel[],
  answers: Answers,
): Prediction[] {
  return [...models]
    .sort((a, b) => a.year - b.year)
    .map((m) => predict(m, answers));
}

export interface Flip {
  featureId: string;
  featureLabel: string;
  fromLabel: string;
  toLabel: string;
  /** Probability if this one answer changed. */
  p: number;
  /** Signed change in probability from the current prediction. */
  delta: number;
}

/**
 * Which single different answer would move the prediction furthest, and in
 * which direction. Exhaustive over levels — the search space is a few dozen
 * cells, so there is no reason to be clever.
 */
export function biggestFlips(
  model: CycleModel,
  answers: Answers,
  limit = 3,
): Flip[] {
  const current = predict(model, answers);
  const flips: Flip[] = [];

  for (const feature of model.features) {
    const currentLevel = feature.levels.find(
      (l) => l.id === answers[feature.id],
    );
    if (!currentLevel) continue;

    for (const level of feature.levels) {
      if (level.id === currentLevel.id) continue;
      const p = predict(model, { ...answers, [feature.id]: level.id }).p;
      flips.push({
        featureId: feature.id,
        featureLabel: feature.label,
        fromLabel: currentLevel.label,
        toLabel: level.label,
        p,
        delta: p - current.p,
      });
    }
  }

  return flips
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}
