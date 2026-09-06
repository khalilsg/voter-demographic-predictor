/**
 * A fitted model is one logistic regression per election cycle, sharing an
 * identical specification across cycles. Because the specification never
 * changes, differences between cycles are differences in the electorate
 * rather than differences in the model — that comparability is the whole
 * point of the project (DESIGN.md §1).
 */

/** One answer option for one question, e.g. "4-year degree" under `educ`. */
export interface Level {
  id: string;
  label: string;
  /**
   * Logistic coefficient in log-odds of voting Democratic, two-party.
   * Reference-level coded: exactly one level per feature has coef 0.
   * Never read this directly for display — it is relative to an arbitrary
   * reference level. Use `contributions()`, which re-centers on the
   * electorate mean.
   */
  coef: number;
  /** Share of that cycle's two-party voters in this level. Sums to 1 per feature. */
  share: number;
}

export interface Feature {
  id: string;
  label: string;
  /** Question text shown in the UI, kept close to the CES wording. */
  question: string;
  levels: Level[];
}

/**
 * Covariance of the fitted coefficients, in the order given by `terms`
 * ("feature.level"). Reference levels are absent — treatment coding fixes them
 * at zero with no variance — and so is the intercept, which after calibration
 * carries an election result rather than an estimate.
 */
export interface Covariance {
  terms: string[];
  values: number[][];
}

/**
 * An observed vote share for a named group, computed from the data with no
 * model involved — the marginal a published crosstab reports. Shown beside a
 * prediction so a reader has one unmodelled number to hold it against.
 */
export interface ReferenceGroup {
  id: string;
  label: string;
  /** Every entry must be satisfied for a profile to belong to the group. */
  criteria: Record<string, string[]>;
  /** Two-party Democratic share within the group, weighted. */
  dem: number;
  /** Unweighted respondents in the group that cycle. */
  n: number;
}

export interface CycleModel {
  year: number;
  /** Log-odds intercept: the reference-level respondent. */
  intercept: number;
  features: Feature[];
  /** Absent on models fitted before uncertainty was added; the UI degrades. */
  covariance?: Covariance;
  /** Absent on older models; the "you most resemble" line is then hidden. */
  reference_groups?: ReferenceGroup[];
  meta: {
    /** Unweighted respondents the cycle was fitted on. */
    n: number;
    source: string;
    /**
     * True while the file holds placeholder coefficients rather than a real
     * fit. The UI must say so prominently — an unlabelled fake number about
     * an election is the one output this project must never produce.
     */
    synthetic: boolean;
    /**
     * Set when the intercept was shifted so this cycle's average voter
     * reproduces the real national result. The demographic coefficients are
     * the fitted ones either way — only the level moves. See DESIGN.md
     * section 6.
     */
    calibrated_to?: number;
    /** The fitted intercept before calibration, kept for inspection. */
    raw_intercept?: number;
    /** What the survey alone put the average voter at, as a probability. */
    raw_baseline?: number;
  };
}

/** A user's answers: feature id -> level id. Missing keys are allowed. */
export type Answers = Record<string, string | undefined>;

export interface Contribution {
  featureId: string;
  featureLabel: string;
  levelId: string;
  levelLabel: string;
  /**
   * Log-odds push relative to the average voter of that cycle. Positive is
   * Democratic. These sum exactly to `logitP - baselineLogit`.
   */
  logOdds: number;
}

export interface Prediction {
  year: number;
  /** Probability of voting Democratic, two-party, in [0, 1]. */
  p: number;
  logitP: number;
  /** Log-odds of the cycle's average voter — where you sit if you answer nothing. */
  baselineLogit: number;
  contributions: Contribution[];
  /**
   * Standard error of `logitP`, or undefined when the model carries no
   * covariance. Covers sampling error in the demographic terms only.
   */
  se?: number;
  /** 95% interval on `p`, present whenever `se` is. */
  interval?: [number, number];
  /** Questions left unanswered, averaged over rather than guessed. */
  unanswered: string[];
  /**
   * Questions the user answered that THIS cycle cannot model, because the
   * survey did not ask them that year. A cycle with any of these is not
   * comparable to the others — it would be scored on a different model — so
   * the UI excludes it rather than showing a number that looks comparable and
   * is not. See DESIGN.md section 1.
   */
  unsupported: string[];
}

/**
 * One question as the UI presents it: the union of every cycle's features,
 * annotated with the cycles that cannot score it.
 */
export interface Question extends Feature {
  /** Cycles whose model includes this feature. */
  years: number[];
  /** Cycles that never asked it. Empty for most questions. */
  missingFrom: number[];
}
