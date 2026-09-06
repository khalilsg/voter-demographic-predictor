import { useMemo, useState } from 'react';
import { MODELS, anySynthetic, modelFor } from '../engine/models.js';
import { biggestFlips, predictAcrossCycles, predict } from '../engine/predict.js';
import type { Answers } from '../engine/types.js';
import { CycleChart } from './components/CycleChart.js';
import { Waterfall } from './components/Waterfall.js';
import { leanColor, leanLabel, pct } from './format.js';

const LATEST = Math.max(...MODELS.map((m) => m.year));

export function App() {
  const [answers, setAnswers] = useState<Answers>({});
  const [year, setYear] = useState<number>(LATEST);

  const model = modelFor(year);
  const cycles = useMemo(() => predictAcrossCycles(MODELS, answers), [answers]);
  const current = useMemo(() => predict(model, answers), [model, answers]);
  const flips = useMemo(() => biggestFlips(model, answers, 3), [model, answers]);

  const answered = model.features.filter((f) => answers[f.id]).length;

  const set = (featureId: string, levelId: string) =>
    setAnswers((prev) => ({
      ...prev,
      // Clicking the selected option clears it, so "no answer" stays reachable.
      [featureId]: prev[featureId] === levelId ? undefined : levelId,
    }));

  return (
    <div className="app">
      {anySynthetic() && (
        <div className="banner" role="alert">
          <strong>Placeholder data.</strong> These coefficients are invented, not
          fitted. Every number below is structurally plausible and substantively
          meaningless until the real CES fit lands.
        </div>
      )}

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
          {model.features.map((f) => (
            <fieldset key={f.id}>
              <legend>{f.label}</legend>
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
          <button type="button" className="reset" onClick={() => setAnswers({})}>
            Clear all answers
          </button>
        </section>

        <section className="result" aria-live="polite">
          <div className="dial" style={{ borderColor: leanColor(current.p) }}>
            <div className="big" style={{ color: leanColor(current.p) }}>
              {pct(current.p)}
            </div>
            <div className="lean">{leanLabel(current.p)}</div>
            <div className="cap">
              chance of voting Democratic in {year}, two-party
            </div>
          </div>

          <p className="note">
            {answered === 0 ? (
              <>
                This is simply the average {year} voter. Answer something and it
                will move.
              </>
            ) : (
              <>
                Based on {answered} of {model.features.length} questions, against{' '}
                {model.meta.n.toLocaleString()} survey respondents.
              </>
            )}
          </p>

          <h2>You, across five elections</h2>
          <CycleChart predictions={cycles} selected={year} onSelect={setYear} />

          <h2>What moves you, in {year}</h2>
          <Waterfall contributions={current.contributions} />

          {flips.length > 0 && (
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

      <footer>
        <p>
          Data: Cooperative Election Study cumulative common content. Party
          identification is deliberately excluded — it would predict almost
          everything and hide the demographics this is about.
        </p>
      </footer>
    </div>
  );
}
