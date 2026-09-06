/**
 * Standalone names for answer levels.
 *
 * A level appears in two places and needs different words in each. Under its
 * question, "Yes" is exactly right — the question is directly above it. In the
 * contribution chart the level appears alone, where "Yes" says nothing at all.
 *
 * This is a display concern, so it lives here rather than in the model files:
 * those carry the survey's own category names, and rewriting them at fit time
 * would mean a refit to change a word on a chart.
 *
 * Anything not listed keeps its own label, which is already self-describing
 * for most questions ("Woman", "Northeast", "Postgraduate degree").
 */
const STANDALONE: Record<string, Record<string, string>> = {
  bornagain: {
    yes: 'Evangelical',
    no: 'Not evangelical',
  },
  income: {
    bottom20: 'Bottom-fifth income',
    lower_mid: 'Lower-middle income',
    middle: 'Middle income',
    upper_mid: 'Upper-middle income',
    top20: 'Top-fifth income',
  },
  marstat: {
    married: 'Married',
    not_married: 'Not married',
  },
};

export const standaloneLabel = (
  featureId: string,
  levelId: string,
  fallback: string,
): string => STANDALONE[featureId]?.[levelId] ?? fallback;
