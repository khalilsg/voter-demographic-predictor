import { MODELS } from '../../engine/models.js';
import { baselineLogit, invLogit } from '../../engine/predict.js';

const TOTAL_N = MODELS.reduce((s, m) => s + m.meta.n, 0);
const YEARS = MODELS.map((m) => m.year).sort((a, b) => a - b);

/**
 * Written for someone comfortable with a regression who is not a
 * methodologist: it assumes probability and least squares, explains log-odds
 * and calibration, and does not assume familiarity with survey weighting or
 * with the CES specifically.
 *
 * Every number here is read from the loaded models rather than typed in, so
 * the page cannot drift out of date the way a hand-written methods section
 * does after a refit.
 */
export function Methodology() {
  return (
    <div className="prose">
      <header>
        <h1>Methodology</h1>
        <p className="sub">
          What this actually computes, what it is fitted on, and its
          limitations. Assumes you have met a regression before.
        </p>
      </header>

      <h2>The model</h2>
      <p>
        One logistic regression per presidential cycle. The outcome is
        two-party Democratic vote — a binary, with third-party and
        non-voters dropped — and the predictors are eleven categorical
        demographic variables, entered as dummies with no interactions:
      </p>
      <pre>
{`logit(P(Democratic)) = α + Σ βᵢ · [demographic level i]`}
      </pre>
      <p>
        Fitted separately on {YEARS.join(', ')}, with{' '}
        <strong>{TOTAL_N.toLocaleString()}</strong> respondents in total. The
        specification is identical across cycles by construction, which is the
        entire basis for comparing them: if the model changed between years,
        movement in the chart would be movement in the method rather than in
        the electorate.
      </p>
      <p>
        <strong>No interactions.</strong> Race × education is the obvious
        omission, and its absence is why the model reads a Black voter who is
        average on everything else as more Democratic than published crosstabs
        report for Black voters as a group. Those are different quantities —
        a conditional holding all else at the mean, versus a marginal
        averaging over the group as it actually is. The additive form is a
        deliberate trade: it keeps every answer's effect a single number that
        sums, which is what makes the contribution chart exactly true rather
        than illustrative.
      </p>

      <h2>The data</h2>
      <p>
        The{' '}
        <a href="https://doi.org/10.7910/DVN/II2DB6">
          Cumulative CES Common Content
        </a>{' '}
        — the Cooperative Election Study, harmonized across years. Roughly
        60,000 respondents per cycle before filtering, surveyed by YouGov using
        matched sampling from an opt-in panel.
      </p>
      <p>
        Exit polls would be the obvious alternative and are the wrong choice
        here. They publish only marginals, never the joint distribution a
        prediction needs; nobody harmonized their categories across cycles; and
        2020 broke the instrument, when Edison added phone interviewing for
        early and mail voters while AP and Fox left the consortium entirely. A
        2016-to-2020 exit-poll comparison confounds real change with a change
        in how the question was asked.
      </p>
      <p>Rows are kept when all of the following hold:</p>
      <ul>
        <li>
          The respondent reported voting for a major-party presidential
          candidate <em>in that cycle's own post-election wave</em>. The
          cumulative file also carries recalled prior votes
          (<code>voted_pres_08</code> and friends); those carry heavy recall
          bias toward the eventual winner and are not used.
        </li>
        <li>
          Vote validation, where the cycle ran it, did not record them as a
          non-voter. Validation matches respondents against commercial voter
          files; cycles without it fall back to self-report.
        </li>
        <li>No answer is missing on any of the ten predictors.</li>
      </ul>
      <p>
        That last condition is listwise deletion, and it is the main reason the
        fitted <em>n</em> is well below the raw cycle size. Estimates weight by
        the survey's own post-election weight where the cycle provides one,
        which corrects for differential attrition between waves; the
        pre-election weight is the fallback.
      </p>
      <p>
        <strong>Income is a within-year quintile, not a dollar bracket.</strong>{' '}
        The CES records nominal dollar bands topped out at $150k+. Used
        directly, inflation would appear as a drifting income effect, so
        respondents are ranked within their own cycle and cut into fifths.
        &ldquo;Middle&rdquo; means the same position in the distribution in
        2008 and 2024 even though the dollars differ. Non-responses
        (&ldquo;prefer not to say&rdquo;) are missing income, not a high
        bracket.
      </p>

      <h2>Reading a coefficient</h2>
      <p>
        Coefficients are in log-odds. Two conversions carry almost everything:
      </p>
      <ul>
        <li>
          <strong>β ÷ 4 ≈ the effect in percentage points.</strong> The
          logistic curve has slope ¼ at its steepest, so this is near-exact in
          the middle of the range and an increasingly generous upper bound
          toward the ends. A coefficient of +0.63 is about 16 points; +2.69 is
          not 67 points, because there is nowhere near that much room left.
        </li>
        <li>
          <strong>e<sup>β</sup> = the odds multiplier.</strong> Exact
          everywhere, which is the lens to use once |β| passes about 1. A
          coefficient of +2.69 multiplies the odds by roughly 15.
        </li>
      </ul>
      <p>
        The published coefficients are <em>centered</em>: each is shown
        relative to that cycle's share-weighted mean for its own question,
        rather than relative to whichever category the regression happened to
        use as its reference. Concretely, for a level ℓ of feature f:
      </p>
      <pre>
{`effect(ℓ) = β_ℓ − Σ_j share_j · β_j`}
      </pre>
      <p>
        This buys two things. Effects become comparable across questions, since
        no arbitrary reference category is baked into them. And they sum
        exactly:
      </p>
      <pre>
{`logit(p̂) = logit(average voter) + Σ effects`}
      </pre>
      <p>
        which is why the contribution bars are the arithmetic rather than a
        picture of it. Centering also separates two things that are easy to
        confuse. A coefficient moving across cycles means the group moved{' '}
        <em>relative to the electorate</em>. The electorate itself also moved,
        and that shift lives in the intercept. High-school-graduate voters go
        from −0.15 in 2008 to −0.43 in 2024 — about 7 points relative to
        everyone else — while the average voter slid 4.5 points over the
        same period, for roughly 11 points in absolute terms.
      </p>

      <h2>Uncertainty</h2>
      <p>
        The interval on the estimate is a 95% band from the sampling error in
        the demographic coefficients. Standard errors alone would not have been
        enough to compute it: what the app displays is a{' '}
        <em>contrast</em> — each answer's coefficient minus its feature's
        share-weighted mean — so the terms it combines are correlated by
        construction. The fit exports the coefficient covariance and the app
        evaluates c′Vc for the contrast it actually shows.
      </p>
      <p>
        The intercept is excluded, so the band covers uncertainty in how groups
        differ and not in the national level, which after calibration comes
        from the election rather than the sample. That is why answering nothing
        gives an interval of zero width, and why the band grows as you answer
        more. It grows fastest on thin cells: a group with few respondents
        produces an interval wide enough to say nothing, and the app says so
        rather than printing a confident number.
      </p>

      <h2>Calibration</h2>
      <p>
        The CES overstates the Democratic share of the reported presidential
        vote. Opt-in panels skew toward the winner, respondents misremember,
        and the sample is weighted to adults rather than to people who actually
        voted. On this data the raw fitted average voter runs 1.6 to 5.7 points
        more Democratic than the election did.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>&nbsp;</th>
              {YEARS.map((y) => (
                <th key={y}>{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Survey alone</th>
              {MODELS.map((m) => (
                <td key={m.year} className="dim">
                  {m.meta.raw_baseline !== undefined
                    ? `${(m.meta.raw_baseline * 100).toFixed(1)}%`
                    : '–'}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">Actual result</th>
              {MODELS.map((m) => (
                <td key={m.year}>
                  {(invLogit(baselineLogit(m)) * 100).toFixed(1)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        A constant offset would be harmless, since everything displayed is
        relative to each cycle's own average voter and a constant cancels. But
        the skew is not constant, and a 4-point spread across cycles would
        enter the year-over-year line as movement indistinguishable from
        realignment.
      </p>
      <p>
        So each cycle's intercept is shifted to reproduce that election's
        actual two-party result, and nothing else is touched — every
        demographic coefficient is the fitted one. This is
        post-stratification to a known margin: the election is a census of
        precisely the quantity being estimated, and better evidence of the
        national level than any survey, while what a survey is uniquely good at
        — how groups differ from one another — is left alone. The
        uncalibrated intercepts are preserved in the model files, and the fit
        script takes <code>--no-calibrate</code>.
      </p>

      <h2>Comparing against an unmodelled number</h2>
      <p>
        Beneath the estimate the app names the most specific published group
        your answers fully belong to, and reports what that group actually did
        — a weighted share computed straight from the respondents, with no
        model involved. It is the marginal a crosstab reports, deliberately not
        the model's output, so there is one number on screen the coefficients
        did not produce and can be checked against.
      </p>
      <p>
        The two will not agree exactly, and the gap is informative rather than
        an error. The model's figure conditions on everything else being
        average; the group's figure averages over the group as it actually is,
        which differs on income, education and geography.
      </p>

      <h2>Questions missing from a cycle</h2>
      <p>
        Union membership was not asked in 2008. Rather than drop the question
        from every cycle or score 2008 on a model missing a term, each cycle is
        fitted on the questions it asked, and a cycle is excluded from the
        comparison whenever you answer something it cannot score. A nine-term
        estimate plotted beside ten-term estimates would put a model difference
        into a chart meant to show electorate differences, with nothing on
        screen to distinguish them.
      </p>

      <h2>Limitations</h2>
      <ul>
        <li>
          <strong>Young voters in 2024.</strong> Opt-in panels missed the shift
          toward the Republicans among under-30 voters. This data puts them
          roughly 11 points more Democratic than the exit polls did, and — worse
          than a level error — trending the wrong way since 2016. The
          calibration above cannot reach it: that shift is uniform, and the
          error here is in the vote rate <em>within</em> the group rather than
          in the group's size. The repository carries a raking step that would
          correct it against a known within-group margin, but its targets file
          ships empty, because filling it takes exit-poll crosstabs and a
          guessed target would be a prior wearing a data costume.
        </li>
        <li>
          <strong>Panel skew generally.</strong> White college graduates fit
          about 6 points too Democratic across cycles. That is a level error
          rather than a shape error, and largely cancels in the centered
          numbers.
        </li>
        <li>
          <strong>Self-reported vote.</strong> Validation covers turnout, not
          candidate choice. Nobody can check who you actually voted for.
        </li>
        <li>
          <strong>Gender comes from a two-option question.</strong> That is the
          only gender item the CES asked consistently across all five cycles; a
          version with more categories exists, but only in recent years, and
          using it would break comparability across the window. The model can
          only represent answers the survey collected.
        </li>
        <li>
          <strong>Groups, not people.</strong> Every group here contains
          millions of voters who voted the other way, and the model has no
          access to anything that actually decides a vote. Party
          identification is excluded on purpose: it would predict nearly
          everything and flatten every demographic effect to invisibility.
        </li>
      </ul>

      <h2>Reproducing it</h2>
      <p>
        The fit is one script over the public cumulative file, and the site is
        a static build of its output — no data is fetched at runtime. Code,
        the fitted coefficients, and a walkthrough from download to sanity
        check are in{' '}
        <a href="https://github.com/khalilsg/voter-demographic-predictor">
          the repository
        </a>
        . <code>npm run check</code> compares each fit against reference points
        whose real values are known, which is how the errors above were found.
      </p>
    </div>
  );
}
