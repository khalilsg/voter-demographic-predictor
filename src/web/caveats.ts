/**
 * Known limitations of the source data, surfaced next to the questions they
 * affect.
 *
 * These are not availability gaps — those are handled by `missingFrom` on the
 * question itself, from the model files. These are places where the survey
 * measured something and measured it *wrong*, which no amount of fitting
 * detects and which calibration deliberately does not correct (DESIGN.md
 * section 6: the intercept shift is uniform, and pulling a single group toward
 * a prior would be a thumb on the scale).
 *
 * That leaves disclosure as the honest option. A reader looking at an age bar
 * has no way to know it is the weakest number on the page unless the page says
 * so. Kept here rather than in DESIGN.md alone, because someone arriving at
 * the published URL will never read DESIGN.md.
 */
export interface Caveat {
  /** Shown under the question, and again beside the result when answered. */
  short: string;
  /** The fuller version, in the result panel. */
  detail: string;
  /** Cycles the problem is worst in, for emphasis. */
  worst: number[];
}

export const CAVEATS: Record<string, Caveat> = {
  age: {
    short: 'The survey gets young voters wrong in 2024.',
    detail:
      'Opt-in online panels missed the shift toward the Republicans among ' +
      'voters under 30 in 2024. This data puts them about 11 points more ' +
      'Democratic than the exit polls did, and trending the wrong way since ' +
      '2016. Age is the least trustworthy answer on this page.',
    worst: [2024],
  },
};

export const caveatFor = (featureId: string): Caveat | undefined =>
  CAVEATS[featureId];
