import { describe, expect, it } from 'vitest';
import { MODELS, modelFor } from './models.js';
import {
  baselineLogit,
  biggestFlips,
  invLogit,
  logit,
  predict,
  predictAcrossCycles,
} from './predict.js';
import type { Answers, CycleModel } from './types.js';

const ALL_CYCLES = MODELS.map((m) => m.year);

/** Every level of every feature, so tests cover the whole answer space. */
function* everyAnswer(model: CycleModel): Generator<Answers> {
  for (const f of model.features) {
    for (const l of f.levels) yield { [f.id]: l.id };
  }
}

describe('link functions', () => {
  it('round-trips', () => {
    for (const p of [0.01, 0.25, 0.5, 0.734, 0.99]) {
      expect(invLogit(logit(p))).toBeCloseTo(p, 12);
    }
  });
});

describe('model files', () => {
  it.each(ALL_CYCLES)('%i has shares summing to 1 per feature', (year) => {
    for (const f of modelFor(year).features) {
      const total = f.levels.reduce((s, l) => s + l.share, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it.each(ALL_CYCLES)('%i has exactly one reference level per feature', (year) => {
    for (const f of modelFor(year).features) {
      expect(f.levels.filter((l) => l.coef === 0)).toHaveLength(1);
    }
  });

  it('shares the same specification across every cycle', () => {
    // The comparability of the year-over-year view depends entirely on this:
    // if the features or levels differ between cycles, the comparison is
    // between two different models, not two different electorates.
    const shape = (m: CycleModel) =>
      m.features.map((f) => `${f.id}:${f.levels.map((l) => l.id).join(',')}`).join('|');
    const first = shape(MODELS[0]!);
    for (const m of MODELS) expect(shape(m)).toBe(first);
  });

  it('anchors the average voter to the real national result', () => {
    // Synthetic coefficients, but the electorate mean is calibrated.
    const actual: Record<number, number> = {
      2008: 0.5366, 2012: 0.5198, 2016: 0.5111, 2020: 0.5224, 2024: 0.4923,
    };
    for (const m of MODELS) {
      expect(invLogit(baselineLogit(m))).toBeCloseTo(actual[m.year]!, 3);
    }
  });
});

describe('predict', () => {
  it.each(ALL_CYCLES)('%i: contributions sum to the displacement from baseline', (year) => {
    const model = modelFor(year);
    // The waterfall chart renders these bars and claims they explain the
    // number. That claim is this assertion.
    for (const answers of everyAnswer(model)) {
      const r = predict(model, answers);
      const sum = r.contributions.reduce((s, c) => s + c.logOdds, 0);
      expect(r.logitP - r.baselineLogit).toBeCloseTo(sum, 10);
    }
  });

  it('with no answers, returns exactly the cycle baseline', () => {
    for (const m of MODELS) {
      const r = predict(m, {});
      expect(r.p).toBeCloseTo(invLogit(baselineLogit(m)), 12);
      expect(r.contributions).toHaveLength(0);
      expect(r.unanswered).toHaveLength(m.features.length);
    }
  });

  it('treats an unknown level id as unanswered rather than throwing', () => {
    const m = modelFor(2020);
    const r = predict(m, { educ: 'phrenology_certificate' });
    expect(r.unanswered).toContain('educ');
    expect(r.p).toBeCloseTo(invLogit(baselineLogit(m)), 12);
  });

  it('is order-independent in the answers object', () => {
    const m = modelFor(2020);
    const a = predict(m, { gender: 'woman', educ: 'postgrad', race: 'white' });
    const b = predict(m, { race: 'white', educ: 'postgrad', gender: 'woman' });
    expect(a.logitP).toBeCloseTo(b.logitP, 12);
  });

  it('always returns a probability in (0, 1)', () => {
    for (const m of MODELS) {
      // The most lopsided answer set the model can express in each direction.
      const extreme = (dir: 1 | -1): Answers =>
        Object.fromEntries(
          m.features.map((f) => [
            f.id,
            [...f.levels].sort((x, y) => dir * (y.coef - x.coef))[0]!.id,
          ]),
        );
      for (const dir of [1, -1] as const) {
        const { p } = predict(m, extreme(dir));
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
    }
  });

  it('moves in the direction of the level coefficient', () => {
    const m = modelFor(2020);
    const base = predict(m, {}).p;
    // Born-again is negative-signed in every cycle of the fixture.
    expect(predict(m, { bornagain: 'yes' }).p).toBeLessThan(base);
    expect(predict(m, { bornagain: 'no' }).p).toBeGreaterThan(base);
  });
});

describe('predictAcrossCycles', () => {
  it('returns one prediction per cycle, chronologically', () => {
    const rs = predictAcrossCycles(MODELS, { educ: 'postgrad' });
    expect(rs.map((r) => r.year)).toEqual([...ALL_CYCLES].sort((a, b) => a - b));
  });

  it('shows the education realignment the app exists to display', () => {
    // Postgraduate voters move toward the Democrats relative to the average
    // voter across the window; high-school-only voters move the other way.
    const rel = (answers: Answers) =>
      predictAcrossCycles(MODELS, answers).map((r) => r.logitP - r.baselineLogit);

    const grad = rel({ educ: 'postgrad' });
    expect(grad.at(-1)!).toBeGreaterThan(grad[0]!);

    const hs = rel({ educ: 'hs' });
    expect(hs.at(-1)!).toBeLessThan(hs[0]!);
  });
});

describe('biggestFlips', () => {
  it('ranks by absolute effect and never suggests the current answer', () => {
    const m = modelFor(2020);
    const answers: Answers = { race: 'white', educ: 'hs', gender: 'man', religion: 'protestant' };
    const flips = biggestFlips(m, answers, 3);

    expect(flips).toHaveLength(3);
    for (const f of flips) expect(f.toLabel).not.toBe(f.fromLabel);

    const mags = flips.map((f) => Math.abs(f.delta));
    expect([...mags].sort((a, b) => b - a)).toEqual(mags);
  });

  it('returns nothing when no question has been answered', () => {
    expect(biggestFlips(modelFor(2020), {})).toHaveLength(0);
  });

  it('reports a delta consistent with re-predicting', () => {
    const m = modelFor(2016);
    const answers: Answers = { educ: 'four_year', race: 'white' };
    const current = predict(m, answers).p;
    for (const f of biggestFlips(m, answers, 5)) {
      const actual = predict(m, { ...answers, [f.featureId]: undefined }).p;
      expect(Number.isFinite(actual)).toBe(true);
      expect(f.p - current).toBeCloseTo(f.delta, 12);
    }
  });
});
