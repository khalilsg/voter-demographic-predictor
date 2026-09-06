import { describe, expect, it } from 'vitest';
import { MODELS, modelFor } from './models.js';
import {
  baselineLogit,
  biggestFlips,
  comparable,
  invLogit,
  logit,
  nearestGroup,
  predict,
  predictAcrossCycles,
  questions,
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
      // Shares are stored rounded to 4dp, so a feature with k levels can drift
      // by up to k * 5e-5 from 1. Demanding more precision than the file
      // format carries fails every real fit while passing the fixture, whose
      // shares happen to renormalize exactly.
      const tolerance = f.levels.length * 5e-5;
      expect(Math.abs(total - 1), `${f.id} shares sum to ${total}`)
        .toBeLessThanOrEqual(tolerance);
    }
  });

  it.each(ALL_CYCLES)('%i has exactly one reference level per feature', (year) => {
    for (const f of modelFor(year).features) {
      expect(f.levels.filter((l) => l.coef === 0)).toHaveLength(1);
    }
  });

  it('defines every shared feature identically across cycles', () => {
    // Comparability of the year-over-year view depends on this. A cycle may
    // omit a feature its survey never asked (see the availability tests
    // below), but where two cycles both carry one, it must mean the same
    // thing — same levels, same order — or the comparison is between two
    // models rather than two electorates.
    const shape = new Map<string, string>();
    for (const m of MODELS) {
      for (const f of m.features) {
        const levels = f.levels.map((l) => l.id).join(',');
        const seen = shape.get(f.id);
        if (seen === undefined) shape.set(f.id, levels);
        else expect(levels, `${f.id} differs in ${m.year}`).toBe(seen);
      }
    }
  });

  it('anchors the average voter to the real national result (fixture only)', () => {
    // The fixture solves each intercept so the electorate mean reproduces the
    // real result exactly. A REAL fit will not: the survey sample is not the
    // electorate, and landing within a couple of points is the most you can
    // ask. Asserting it unconditionally would fail every real fit and make a
    // working one look broken - `npm run check` carries the loose version.
    const actual: Record<number, number> = {
      2008: 0.5366, 2012: 0.5198, 2016: 0.5111, 2020: 0.5224, 2024: 0.4923,
    };
    for (const m of MODELS.filter((x) => x.meta.synthetic)) {
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

describe('per-cycle feature availability', () => {
  // Not every question was asked in every wave — union membership is absent
  // from the 2008 CES — so a cycle can legitimately carry fewer features.
  const partial = questions(MODELS).filter((q) => q.missingFrom.length > 0);

  it('exposes a question set spanning every cycle', () => {
    const all = new Set(MODELS.flatMap((m) => m.features.map((f) => f.id)));
    expect(questions(MODELS).map((q) => q.id).sort()).toEqual([...all].sort());
  });

  it('records which cycles each question is missing from', () => {
    for (const q of questions(MODELS)) {
      expect([...q.years, ...q.missingFrom].sort()).toEqual(ALL_CYCLES.slice().sort());
      for (const year of q.years) {
        expect(modelFor(year).features.some((f) => f.id === q.id)).toBe(true);
      }
      for (const year of q.missingFrom) {
        expect(modelFor(year).features.some((f) => f.id === q.id)).toBe(false);
      }
    }
  });

  it('the fixture actually exercises a partially available question', () => {
    // If this fails the fixture stopped reproducing the real data's shape, and
    // every assertion below is passing vacuously.
    expect(partial.length).toBeGreaterThan(0);
  });

  it('reports an answer a cycle cannot model instead of ignoring it', () => {
    for (const q of partial) {
      const answers: Answers = { [q.id]: q.levels[0]!.id };
      for (const year of q.missingFrom) {
        expect(predict(modelFor(year), answers).unsupported).toContain(q.id);
      }
      for (const year of q.years) {
        expect(predict(modelFor(year), answers).unsupported).toEqual([]);
      }
    }
  });

  it('an unsupported answer does not silently move that cycle', () => {
    // The danger is a number that looks comparable and is not: the answer
    // vanishes, the cycle still renders, and nothing says why.
    for (const q of partial) {
      for (const year of q.missingFrom) {
        const m = modelFor(year);
        const before = predict(m, {}).p;
        const after = predict(m, { [q.id]: q.levels[0]!.id }).p;
        expect(after).toBeCloseTo(before, 12);
      }
    }
  });

  it('comparable() drops exactly the cycles that cannot score the answers', () => {
    for (const q of partial) {
      const rs = predictAcrossCycles(MODELS, { [q.id]: q.levels[0]!.id });
      expect(comparable(rs).map((r) => r.year)).toEqual(q.years);
    }
  });

  it('keeps every cycle when no partial question is answered', () => {
    const rs = predictAcrossCycles(MODELS, { gender: 'woman', educ: 'postgrad' });
    expect(comparable(rs)).toHaveLength(MODELS.length);
  });
});

describe('predictAcrossCycles', () => {
  it('returns one prediction per cycle, chronologically', () => {
    const rs = predictAcrossCycles(MODELS, { educ: 'postgrad' });
    expect(rs.map((r) => r.year)).toEqual([...ALL_CYCLES].sort((a, b) => a - b));
  });

  it.skipIf(MODELS.some((m) => !m.meta.synthetic))(
     'shows the education realignment the app exists to display (fixture only)', () => {
    // Postgraduate voters move toward the Democrats relative to the average
    // voter across the window; high-school-only voters move the other way.
    const rel = (answers: Answers) =>
      predictAcrossCycles(MODELS, answers).map((r) => r.logitP - r.baselineLogit);

    const grad = rel({ educ: 'postgrad' });
    expect(grad.at(-1)!).toBeGreaterThan(grad[0]!);

    const hs = rel({ educ: 'hs' });
    expect(hs.at(-1)!).toBeLessThan(hs[0]!);
  },
  );
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

describe('uncertainty', () => {
  const withCov = MODELS.filter((m) => m.covariance);

  it('is absent, not wrong, when the model carries no covariance', () => {
    for (const m of MODELS.filter((x) => !x.covariance)) {
      const r = predict(m, { gender: 'woman' });
      expect(r.se).toBeUndefined();
      expect(r.interval).toBeUndefined();
    }
  });

  it.skipIf(withCov.length === 0)('brackets the point estimate', () => {
    for (const m of withCov) {
      for (const answers of everyAnswer(m)) {
        const r = predict(m, answers);
        const [lo, hi] = r.interval!;
        expect(lo).toBeLessThanOrEqual(r.p);
        expect(hi).toBeGreaterThanOrEqual(r.p);
        expect(lo).toBeGreaterThan(0);
        expect(hi).toBeLessThan(1);
      }
    }
  });

  it.skipIf(withCov.length === 0)('is zero width when nothing is answered', () => {
    // No demographic terms are in play, and the baseline is a known margin.
    for (const m of withCov) expect(predict(m, {}).se).toBeCloseTo(0, 10);
  });

  it.skipIf(withCov.length === 0)('widens as more questions are answered', () => {
    for (const m of withCov) {
      const one = predict(m, { race: 'black' }).se!;
      const many = predict(m, {
        race: 'black', educ: 'postgrad', religion: 'jewish', region: 'northeast',
      }).se!;
      expect(many).toBeGreaterThan(one);
    }
  });
});

describe('nearestGroup', () => {
  const withGroups = MODELS.filter((m) => m.reference_groups?.length);

  it('is undefined when the model carries no reference groups', () => {
    for (const m of MODELS.filter((x) => !x.reference_groups?.length)) {
      expect(nearestGroup(m, { race: 'black' })).toBeUndefined();
    }
  });

  it.skipIf(withGroups.length === 0)('matches nothing when nothing is answered', () => {
    for (const m of withGroups) expect(nearestGroup(m, {})).toBeUndefined();
  });

  it.skipIf(withGroups.length === 0)('only returns groups the answers fully satisfy', () => {
    for (const m of withGroups) {
      for (const answers of everyAnswer(m)) {
        const g = nearestGroup(m, answers);
        if (!g) continue;
        for (const [featureId, levels] of Object.entries(g.criteria)) {
          expect(levels).toContain(answers[featureId]);
        }
      }
    }
  });

  it.skipIf(withGroups.length === 0)('prefers the more specific group', () => {
    for (const m of withGroups) {
      // "White voters without a college degree" (2 criteria) should beat any
      // single-criterion group the same answers also satisfy.
      const g = nearestGroup(m, { race: 'white', educ: 'hs', gender: 'woman' });
      if (!g) continue;
      expect(Object.keys(g.criteria).length).toBeGreaterThan(1);
    }
  });
});

describe('nearestGroup ranking', () => {
  const withGroups = MODELS.filter((m) => m.reference_groups?.length);

  it.skipIf(withGroups.length === 0)(
    'prefers a specific group over a large generic one',
    () => {
      // The bug this replaces: ranking ties by size descending made every
      // woman resemble "Women", however distinctive her other answers.
      for (const m of withGroups) {
        const black = nearestGroup(m, { gender: 'woman', race: 'black' });
        expect(black?.id).toBe('black');

        const hispanic = nearestGroup(m, { gender: 'woman', race: 'hispanic' });
        expect(hispanic?.id).toBe('hispanic');
      }
    },
  );

  it.skipIf(withGroups.length === 0)('still prefers more criteria over fewer', () => {
    for (const m of withGroups) {
      const g = nearestGroup(m, { race: 'white', educ: 'hs', gender: 'woman' });
      expect(Object.keys(g!.criteria).length).toBeGreaterThan(1);
    }
  });
});
