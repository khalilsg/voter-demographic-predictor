import { describe, expect, it } from 'vitest';
import { MODELS } from '../engine/models.js';
import { comparable, predictAcrossCycles, questions } from '../engine/predict.js';
import { PRESETS } from './presets.js';

/**
 * Each preset's blurb makes a claim about what the user will see. A refit can
 * quietly falsify those claims — the numbers move, the prose does not — so the
 * claims are asserted here rather than trusted.
 *
 * Tolerances are loose on purpose: the point is to catch a story that has
 * reversed or evaporated, not to pin a coefficient to two decimal places.
 */

const QUESTIONS = questions(MODELS);

const track = (id: string) => {
  const p = PRESETS.find((x) => x.id === id)!;
  const shown = comparable(predictAcrossCycles(MODELS, p.answers));
  return {
    years: shown.map((r) => r.year),
    pct: shown.map((r) => r.p * 100),
  };
};

describe('preset profiles', () => {
  it('every answer names a real question and level', () => {
    for (const p of PRESETS) {
      for (const [featureId, levelId] of Object.entries(p.answers)) {
        const q = QUESTIONS.find((x) => x.id === featureId);
        expect(q, `${p.id}: no such question "${featureId}"`).toBeDefined();
        expect(
          q!.levels.some((l) => l.id === levelId),
          `${p.id}: "${levelId}" is not a level of ${featureId}`,
        ).toBe(true);
      }
    }
  });

  it('presets have unique ids and non-empty copy', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.look.length).toBeGreaterThan(20);
    }
  });

  it('each preset actually moves enough to be worth loading', () => {
    // A profile pinned near 0% or 100% produces a flat line whatever the
    // coefficients do. Those are the ones not worth showing, and the reason
    // this suite exists.
    for (const p of PRESETS) {
      if (p.id === 'black-voter') continue; // deliberately near the ceiling
      const { pct } = track(p.id);
      const range = Math.max(...pct) - Math.min(...pct);
      expect(range, `${p.id} barely moves (${range.toFixed(1)}pt range)`)
        .toBeGreaterThan(4);
    }
  });

  it('"No degree, Midwest" declines substantially', () => {
    const { pct } = track('noncollege');
    expect(pct.at(-1)! - pct[0]!).toBeLessThan(-10);
  });

  it('"Union household" drops 2008, as its blurb says', () => {
    const { years } = track('union');
    expect(years).not.toContain(2008);
    expect(years[0]).toBe(2012);
  });

  it('"Hispanic college graduate" peaks mid-window then falls', () => {
    const { pct } = track('hispanic-grad');
    const peak = Math.max(...pct);
    expect(peak).toBeGreaterThan(pct[0]!);
    expect(pct.at(-1)!).toBeLessThan(peak - 10);
  });

  it('"Postgraduate, South" moves the opposite way to the non-college profile', () => {
    const grad = track('postgrad-south').pct;
    const nonGrad = track('noncollege').pct;
    expect(grad.at(-1)! - grad[0]!).toBeGreaterThan(0);
    expect(nonGrad.at(-1)! - nonGrad[0]!).toBeLessThan(0);
  });

  it('"Black voter" stays high while its coefficient falls hard', () => {
    // The teaching point: a big log-odds change buying almost no probability.
    const { pct } = track('black-voter');
    expect(Math.min(...pct)).toBeGreaterThan(85);
    const first = MODELS.find((m) => m.year === 2008)!;
    const last = MODELS.find((m) => m.year === 2024)!;
    const coefOf = (m: typeof first) =>
      m.features.find((f) => f.id === 'race')!.levels.find((l) => l.id === 'black')!.coef;
    expect(coefOf(first) - coefOf(last)).toBeGreaterThan(0.8);
  });
});
