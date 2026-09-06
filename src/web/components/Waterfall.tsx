import type { Contribution } from '../../engine/types.js';

/**
 * Each bar is one term's log-odds push relative to the average voter of that
 * cycle. They sum exactly to the displacement from the baseline — see the
 * invariant in predict.ts — so this chart is the arithmetic rather than an
 * illustration of it.
 */
export function Waterfall({ contributions }: { contributions: Contribution[] }) {
  if (contributions.length === 0) {
    return <p className="empty">Answer a question to see what moves the needle.</p>;
  }

  const sorted = [...contributions].sort(
    (a, b) => Math.abs(b.logOdds) - Math.abs(a.logOdds),
  );
  const max = Math.max(...sorted.map((c) => Math.abs(c.logOdds)), 0.2);

  return (
    <ul className="waterfall">
      {sorted.map((c) => {
        const frac = Math.abs(c.logOdds) / max;
        const dem = c.logOdds >= 0;
        return (
          <li key={c.featureId}>
            <span className="wf-label" title={c.featureLabel}>
              {c.levelLabel}
            </span>
            <span className="wf-track">
              <span
                className={dem ? 'wf-bar dem' : 'wf-bar gop'}
                style={{ width: `${frac * 50}%`, [dem ? 'left' : 'right']: '50%' }}
              />
              <span className="wf-axis" />
            </span>
            <span className={`wf-value ${dem ? 'dem' : 'gop'}`}>
              {c.logOdds >= 0 ? '+' : '−'}
              {Math.abs(c.logOdds).toFixed(2)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
