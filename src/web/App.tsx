import { useEffect, useMemo, useState } from 'react';
import { MODELS, anySynthetic, modelFor } from '../engine/models.js';
import {
  biggestFlips,
  comparable,
  nearestGroup,
  predict,
  predictAcrossCycles,
  questions,
} from '../engine/predict.js';
import type { Answers } from '../engine/types.js';
import { Coefficients } from './components/Coefficients.js';
import { CycleChart } from './components/CycleChart.js';
import { Methodology } from './components/Methodology.js';
import { Waterfall } from './components/Waterfall.js';
import { CAVEATS, caveatFor } from './caveats.js';
import { PRESETS } from './presets.js';
import { PROFILE_PREFIX, decodeAnswers, profileUrl } from './share.js';
import { leanColor, leanLabel, pct } from './format.js';

const LATEST = Math.max(...MODELS.map((m) => m.year));
const QUESTIONS = questions(MODELS);

const listYears = (years: number[]): string =>
  years.length === 1
    ? String(years[0])
    : `${years.slice(0, -1).join(', ')} and ${years.at(-1)}`;

/** "that year" / "those years", so the copy reads for one cycle or several. */
const thatYear = (n: number): string => (n === 1 ? 'that year' : 'those years');

/**
 * Hash routing, so a deep link works on a static host with no server rewrite
 * rules. Two views only; anything unrecognised falls back to the predictor.
 */
function useRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.replace(/^#\/?/, '');
}

export function App() {
  const [answers, setAnswers] = useState<Answers>(() => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash.startsWith(PROFILE_PREFIX)
      ? decodeAnswers(hash.slice(PROFILE_PREFIX.length), QUESTIONS)
      : {};
  });
  const [year, setYear] = useState<number>(LATEST);
  const [preset, setPreset] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const route = useRoute();

  // Keep the address bar in step with the answers, via replaceState so that
  // toggling chips does not fill the back button with dead states.
  useEffect(() => {
    if (route !== '' && !route.startsWith(PROFILE_PREFIX)) return;
    const url = profileUrl(answers);
    if (url !== window.location.href) {
      window.history.replaceState(null, '', url);
    }
  }, [answers, route]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const model = modelFor(year);
  const cycles = useMemo(() => predictAcrossCycles(MODELS, answers), [answers]);
  const shown = useMemo(() => comparable(cycles), [cycles]);
  const excluded = useMemo(
    () => cycles.filter((r) => r.unsupported.length > 0),
    [cycles],
  );
  const current = useMemo(() => predict(model, answers), [model, answers]);
  const flips = useMemo(() => biggestFlips(model, answers, 3), [model, answers]);
  const resembles = useMemo(() => nearestGroup(model, answers), [model, answers]);

  const answered = QUESTIONS.filter((q) => answers[q.id]).length;
  const blocked = current.unsupported.length > 0;

  const loadPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setAnswers({ ...p.answers });
    setPreset(id);
    setYear(LATEST);
  };

  const set = (featureId: string, levelId: string) => {
    // Once an answer is edited by hand it is no longer that example profile,
    // so the note describing it stops applying.
    setPreset(undefined);
    setAnswers((prev) => ({
      ...prev,
      // Clicking the selected option clears it, so "no answer" stays reachable.
      [featureId]: prev[featureId] === levelId ? undefined : levelId,
    }));
  };

  return (
    <div className="app">
      {anySynthetic() && (
        <div className="banner" role="alert">
          <strong>Placeholder data.</strong> These coefficients are invented, not
          fitted. Every number below is structurally plausible and substantively
          meaningless until the real CES fit lands.
        </div>
      )}

      <nav className="nav">
        <a
          href="#/"
          className={route === '' || route.startsWith(PROFILE_PREFIX) ? 'on' : ''}
        >
          Predictor
        </a>
        <a href="#/coefficients" className={route === 'coefficients' ? 'on' : ''}>
          Coefficients
        </a>
        <a href="#/methodology" className={route === 'methodology' ? 'on' : ''}>
          Methodology
        </a>
      </nav>

      {route === 'methodology' ? (
        <Methodology />
      ) : route === 'coefficients' ? (
        <Coefficients questions={QUESTIONS} />
      ) : (
        <>
      <header>
        <h1>Would you have voted blue or red?</h1>
        <p className="sub">
          A toy. It knows nothing about you except demographics, and it describes
          groups of millions, not people. Plenty of voters in every group below
          voted the other way.
        </p>
      </header>

      <main>
        <section className="questions" aria-label="Your demographics">
          <div className="presets">
            <p className="presets-lead">Or load an example:</p>
            <div className="opts">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={preset === p.id ? 'opt on' : 'opt'}
                  aria-pressed={preset === p.id}
                  onClick={() => loadPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset && (
              <p className="presets-look">
                {PRESETS.find((p) => p.id === preset)!.look}
              </p>
            )}
          </div>

          {QUESTIONS.map((f) => (
            <fieldset key={f.id} className={f.missingFrom.length ? 'partial' : undefined}>
              <legend>{f.label}</legend>
              {f.missingFrom.length > 0 && (
                <p className="avail">
                  Not asked in {listYears(f.missingFrom)}
                  {answers[f.id]
                    ? ` — ${thatYear(f.missingFrom.length)} ${
                        f.missingFrom.length === 1 ? 'is' : 'are'
                      } left out below.`
                    : `. Answering this leaves ${thatYear(
                        f.missingFrom.length,
                      )} out of the comparison.`}
                </p>
              )}
              {caveatFor(f.id) && (
                <p className="caveat">{caveatFor(f.id)!.short}</p>
              )}
              <p className="q">{f.question}</p>
              <div className="opts">
                {f.levels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={answers[f.id] === l.id ? 'opt on' : 'opt'}
                    aria-pressed={answers[f.id] === l.id}
                    onClick={() => set(f.id, l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className="reset"
            onClick={() => {
              setAnswers({});
              setPreset(undefined);
            }}
          >
            Clear all answers
          </button>
          {answered > 0 && (
            <button
              type="button"
              className="reset share"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(profileUrl(answers))
                  .then(() => setCopied(true))
                  .catch(() => undefined);
              }}
            >
              {copied ? 'Link copied' : 'Copy link to this profile'}
            </button>
          )}
        </section>

        <section className="result" aria-live="polite">
          {blocked ? (
            <div className="dial blocked">
              <div className="big muted">—</div>
              <div className="lean">{year} can't be scored</div>
              <div className="cap">
                {current.unsupported
                  .map((id) => QUESTIONS.find((q) => q.id === id)?.label ?? id)
                  .join(' and ')}{' '}
                wasn't asked that year, so this cycle would be answering a
                different question from the others.
              </div>
              <button type="button" className="reset"
                      onClick={() => setYear(LATEST)}>
                Show {LATEST} instead
              </button>
            </div>
          ) : (
            <div className="dial" style={{ borderColor: leanColor(current.p) }}>
              <div className="big" style={{ color: leanColor(current.p) }}>
                {pct(current.p)}
              </div>
              <div className="lean">{leanLabel(current.p)}</div>
              <div className="cap">
                chance of voting Democratic in {year}, two-party
              </div>
              {current.interval && (
                <div className="ci">
                  {pct(current.interval[0])}–{pct(current.interval[1])} at 95%
                  {current.interval[1] - current.interval[0] > 0.2 && (
                    <span className="ci-warn">
                      {' '}— too wide to mean much. Some answer here matches
                      few respondents.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <p className="note">
            {answered === 0 ? (
              <>
                This is simply the average {year} voter. Answer something and it
                will move.
              </>
            ) : (
              <>
                Based on {answered} of {QUESTIONS.length} questions, against{' '}
                {model.meta.n.toLocaleString()} survey respondents.
              </>
            )}
          </p>

          {!blocked && resembles && (
            <p className="resemble">
              <strong>A real number, for comparison.</strong>{' '}
              <strong>{resembles.label}</strong> in {year}:{' '}
              {pct(resembles.dem)} voted Democratic, among{' '}
              {resembles.n.toLocaleString()} surveyed — measured directly,
              with no model involved. The estimate above differs because it
              also uses your other answers.
            </p>
          )}

          {Object.entries(CAVEATS)
            .filter(([id]) => answers[id])
            .map(([id, c]) => (
              <p key={id} className="caveat detail">
                <strong>
                  About your{' '}
                  {QUESTIONS.find((q) => q.id === id)?.label.toLowerCase()}{' '}
                  answer:
                </strong>{' '}
                {c.detail}
              </p>
            ))}

          <h2>
            You, across {shown.length} election{shown.length === 1 ? '' : 's'}
          </h2>
          <CycleChart
            predictions={shown}
            excluded={excluded}
            selected={year}
            onSelect={setYear}
          />

          {!blocked && (
            <>
              <h2>What moves you, in {year}</h2>
              <Waterfall contributions={current.contributions} />
            </>
          )}

          {!blocked && flips.length > 0 && (
            <>
              <h2>Change one answer</h2>
              <ul className="flips">
                {flips.map((f) => (
                  <li key={`${f.featureId}-${f.toLabel}`}>
                    <span>
                      {f.featureLabel}: {f.fromLabel} → <strong>{f.toLabel}</strong>
                    </span>
                    <span className={f.delta >= 0 ? 'dem' : 'gop'}>
                      {pct(f.p)} ({f.delta >= 0 ? '+' : '−'}
                      {Math.abs(f.delta * 100).toFixed(0)} pts)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
        </>
      )}

      <footer>
        <p>
          Party identification is deliberately excluded from the model — it
          would predict almost everything and hide the demographics this is
          about.
        </p>
        <p className="cite">
          Data:{' '}
          <a href="https://doi.org/10.7910/DVN/II2DB6">
            Cumulative CES Common Content
          </a>
          , Kuriwaki, Shiro, Harvard Dataverse — a harmonization of the{' '}
          <a href="https://cces.gov.harvard.edu/">
            Cooperative Election Study
          </a>{' '}
          common content (Schaffner, Ansolabehere, Pope and Shih), released
          under a CC0 1.0 public-domain waiver. Neither the CES nor its
          principal investigators endorse or are responsible for anything
          shown here.
        </p>
      </footer>
    </div>
  );
}
