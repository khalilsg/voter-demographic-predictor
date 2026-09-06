import type { CycleModel } from './types.js';
import m2008 from '../../data/models/2008.json' with { type: 'json' };
import m2012 from '../../data/models/2012.json' with { type: 'json' };
import m2016 from '../../data/models/2016.json' with { type: 'json' };
import m2020 from '../../data/models/2020.json' with { type: 'json' };
import m2024 from '../../data/models/2024.json' with { type: 'json' };

// Cast through unknown: TypeScript infers a literal type per JSON file, and a
// reference group's `criteria` has a different key set in each entry, so the
// inferred union never structurally matches CycleModel. The shape is enforced
// where it matters instead — the fit script writes it, and the tests assert
// share sums, reference levels, allowed keys and cross-cycle consistency.
export const MODELS = [m2008, m2012, m2016, m2020, m2024] as unknown as CycleModel[];

export const modelFor = (year: number): CycleModel => {
  const m = MODELS.find((x) => x.year === year);
  if (!m) throw new Error(`no model for cycle ${year}`);
  return m;
};

/** True if any loaded cycle is still placeholder data. Drives the UI banner. */
export const anySynthetic = (): boolean => MODELS.some((m) => m.meta.synthetic);
