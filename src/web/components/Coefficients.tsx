import { useState } from 'react';
import { MODELS } from '../../engine/models.js';
import { baselineLogit, centeredCoef, invLogit } from '../../engine/predict.js';
import type { Question } from '../../engine/types.js';
import { standaloneLabel } from '../labels.js';

const YEARS = MODELS.map((m) => m.year).sort((a, b) => a - b);

type View = 'effect' | 'share' | 'raw';

const VIEWS: Array<{ id: View; label: string; blurb: string }> = [
  {
    id: 'effect',
    label: 'Effect',
    blurb:
      'Log-odds relative to that cycle’s average voter. Positive is more ' +
      'Democratic. These are the numbers the contribution bars show, and they ' +
      'add up: a voter’s total is the sum of their answers’ effects.',
  },
  {
    id: 'share',
    label: 'Share of voters',
    blurb:
      'What share of that cycle’s two-party voters gave this answer. ' +
      'Changes here are the electorate’s composition changing, which is a ' +
      'different story from the same group voting differently.',
  },
  {
    id: 'raw',
    label: 'Raw coefficient',
    blurb:
      'The regression’s own output, relative to an arbitrary reference ' +
      'level (the one showing 0). Not comparable across questions — use ' +
      'Effect for that. Shown because it is what the model file contains.',
  },
];

/** Blue for Democratic, red for Republican, transparent near zero. */
function cellStyle(value: number | undefined, view: View) {
  if (value === undefined || view === 'share') return undefined;
  const strength = Math.min(1, Math.abs(value) / 1.2);
  const color = value >= 0 ? 'var(--dem)' : 'var(--gop)';
  return {
    background: `color-mix(in oklab, ${color} ${Math.round(strength * 26)}%, transparent)`,
  };
}

export function Coefficients({ questions }: { questions: Question[] }) {
  const [view, setView] = useState<View>('effect');
  const active = VIEWS.find((v) => v.id === view)!;

  const cell = (
    featureId: string,
    levelId: string,
    year: number,
  ): number | undefined => {
    const model = MODELS.find((m) => m.year === year)!;
    if (view === 'effect') return centeredCoef(model, featureId, levelId);
    const level = model.features
      .find((f) => f.id === featureId)
      ?.levels.find((l) => l.id === levelId);
    if (!level) return undefined;
    return view === 'share' ? level.share : level.coef;
  };

  const format = (v: number | undefined): string => {
    if (v === undefined) return '–';
    if (view === 'share') return `${(v * 100).toFixed(0)}%`;
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
  };

  return (
    <div className="coef">
      <header>
        <h1>The coefficients</h1>
        <p className="sub">
          Everything the predictor knows, laid out. One logistic regression
          per election, the same specification each time, so a row read left to
          right is a group moving — or not — across sixteen years.
        </p>
      </header>

      <div className="viewpick">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={v.id === view ? 'opt on' : 'opt'}
            aria-pressed={v.id === view}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p className="blurb">{active.blurb}</p>

      <section className="coef-block">
        <h2>Each cycle</h2>
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
                <th scope="row">Average voter</th>
                {MODELS.map((m) => (
                  <td key={m.year}>
                    {(invLogit(baselineLogit(m)) * 100).toFixed(1)}%
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">
                  Survey said <span className="dim">(before calibration)</span>
                </th>
                {MODELS.map((m) => (
                  <td key={m.year} className="dim">
                    {m.meta.raw_baseline !== undefined
                      ? `${(m.meta.raw_baseline * 100).toFixed(1)}%`
                      : '–'}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Respondents</th>
                {MODELS.map((m) => (
                  <td key={m.year}>{m.meta.n.toLocaleString()}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="foot">
          Each intercept is shifted so the average voter reproduces that
          election’s actual two-party result; the demographic coefficients
          are the fitted ones, untouched. The row above shows what the survey
          alone said.
        </p>
      </section>

      {questions.map((q) => (
        <section className="coef-block" key={q.id}>
          <h2>
            {q.label}
            {q.missingFrom.length > 0 && (
              <span className="dim">
                {' '}
                — not asked in {q.missingFrom.join(', ')}
              </span>
            )}
          </h2>
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
                {q.levels.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">
                      {standaloneLabel(q.id, l.id, l.label)}
                    </th>
                    {YEARS.map((y) => {
                      const v = cell(q.id, l.id, y);
                      return (
                        <td key={y} style={cellStyle(v, view)}>
                          {format(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="foot">
        The underlying files are{' '}
        <a href="https://github.com/khalilsg/voter-demographic-predictor/tree/main/data/models">
          five JSON files in the repository
        </a>
        , one per cycle, a few kilobytes each.
      </p>
    </div>
  );
}
