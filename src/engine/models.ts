import type { CycleModel } from './types.js';
import m2008 from '../../data/models/2008.json' with { type: 'json' };
import m2012 from '../../data/models/2012.json' with { type: 'json' };
import m2016 from '../../data/models/2016.json' with { type: 'json' };
import m2020 from '../../data/models/2020.json' with { type: 'json' };
import m2024 from '../../data/models/2024.json' with { type: 'json' };

export const MODELS: CycleModel[] = [m2008, m2012, m2016, m2020, m2024] as CycleModel[];

export const modelFor = (year: number): CycleModel => {
  const m = MODELS.find((x) => x.year === year);
  if (!m) throw new Error(`no model for cycle ${year}`);
  return m;
};

/** True if any loaded cycle is still placeholder data. Drives the UI banner. */
export const anySynthetic = (): boolean => MODELS.some((m) => m.meta.synthetic);
