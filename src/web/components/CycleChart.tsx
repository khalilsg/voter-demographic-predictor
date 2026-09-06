import type { Prediction } from '../../engine/types.js';
import { leanColor, pct } from '../format.js';

const W = 520;
const H = 190;
const PAD_X = 44;
const PAD_Y = 26;

/**
 * Vertical domain. Always includes 50% — the whole question is which side of it
 * you land on — but expands to fit the data, because a fixed domain flattens
 * the line whenever every cycle sits well off the midpoint, which is exactly
 * the case for the lopsided profiles people most want to try.
 */
function domain(ps: number[]): [number, number] {
  const lo = Math.min(0.5, ...ps);
  const hi = Math.max(0.5, ...ps);
  const pad = Math.max(0.04, (hi - lo) * 0.18);
  return [Math.max(0, lo - pad), Math.min(1, hi + pad)];
}

/**
 * The same answers evaluated against every cycle. This is the point of the
 * app: the model specification is identical across years, so movement here is
 * movement in the electorate, not in the method.
 */
export function CycleChart({
  predictions,
  excluded = [],
  selected,
  onSelect,
}: {
  predictions: Prediction[];
  /**
   * Cycles that cannot score the current answers, because a question the user
   * answered was not asked that year. Drawn as a gap on the axis rather than
   * omitted silently — a year quietly disappearing from a five-point chart is
   * more confusing than a marked absence.
   */
  excluded?: Prediction[];
  selected: number;
  onSelect: (year: number) => void;
}) {
  const allYears = [...predictions, ...excluded]
    .map((r) => r.year)
    .sort((a, b) => a - b);
  // Include the band in the domain so it is never clipped by the plot edge.
  const [lo, hi] = domain(
    predictions.flatMap((r) => (r.interval ? [r.p, ...r.interval] : [r.p])),
  );

  // Excluded cycles keep their slot on the axis, so the remaining points stay
  // in their true chronological positions instead of sliding together.
  const slot = (year: number) => allYears.indexOf(year);
  const x = (i: number) =>
    PAD_X + (i * (W - PAD_X * 2)) / Math.max(1, allYears.length - 1);
  const y = (p: number) =>
    PAD_Y + (1 - (p - lo) / (hi - lo)) * (H - PAD_Y * 2);

  const path = predictions
    .map((r, i) => `${i ? 'L' : 'M'}${x(slot(r.year))},${y(r.p)}`)
    .join(' ');
  const mid = y(0.5);
  const plotW = W - PAD_X * 2;

  return (
    <figure className="cycles">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Prediction by election cycle">
        {/* Tint splits at the 50% line, wherever the domain puts it. */}
        <rect x={PAD_X} y={PAD_Y} width={plotW} height={Math.max(0, mid - PAD_Y)}
              fill="var(--dem)" opacity="0.07" />
        <rect x={PAD_X} y={mid} width={plotW} height={Math.max(0, H - PAD_Y - mid)}
              fill="var(--gop)" opacity="0.07" />
        <line x1={PAD_X} x2={W - PAD_X} y1={mid} y2={mid}
              stroke="var(--line)" strokeDasharray="3 3" />
        <text x={PAD_X - 8} y={mid + 4} textAnchor="end" className="tick">50%</text>

        {/* Confidence band, drawn under the line: forward along the upper
            bound, back along the lower. Absent on models without covariance. */}
        {predictions.every((r) => r.interval) && predictions.length > 1 && (
          <path
            d={
              predictions
                .map((r, i) => `${i ? 'L' : 'M'}${x(slot(r.year))},${y(r.interval![1])}`)
                .join(' ') +
              ' ' +
              [...predictions]
                .reverse()
                .map((r) => `L${x(slot(r.year))},${y(r.interval![0])}`)
                .join(' ') +
              ' Z'
            }
            fill="var(--ink-soft)"
            opacity="0.16"
          />
        )}

        <path d={path} fill="none" stroke="var(--ink-soft)" strokeWidth="2" />

        {excluded.map((r) => (
          <g key={r.year} className="pt excluded">
            <line x1={x(slot(r.year))} x2={x(slot(r.year))} y1={PAD_Y} y2={H - PAD_Y}
                  stroke="var(--line)" strokeDasharray="2 4" />
            <text x={x(slot(r.year))} y={H - 6} textAnchor="middle" className="tick muted">
              {r.year}
            </text>
            <text x={x(slot(r.year))} y={y((lo + hi) / 2)} textAnchor="middle"
                  className="tick muted">
              not asked
            </text>
          </g>
        ))}

        {predictions.map((r) => {
          // Keep the value label inside the plot when the point is near the top.
          const above = y(r.p) - PAD_Y > 16;
          const cx = x(slot(r.year));
          return (
            <g key={r.year}
               onClick={() => onSelect(r.year)}
               className={r.year === selected ? 'pt selected' : 'pt'}>
              <circle cx={cx} cy={y(r.p)} r={r.year === selected ? 7 : 5}
                      fill={leanColor(r.p)} stroke="var(--bg)" strokeWidth="2" />
              <text x={cx} y={H - 6} textAnchor="middle" className="tick">{r.year}</text>
              <text x={cx} y={y(r.p) + (above ? -13 : 20)} textAnchor="middle"
                    className="ptval">
                {pct(r.p)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        {excluded.length > 0 ? (
          <>
            {excluded.map((r) => r.year).join(' and ')}{' '}
            {excluded.length === 1 ? 'is' : 'are'} left out: you answered a
            question {excluded.length === 1 ? 'it' : 'they'} never asked, so{' '}
            {excluded.length === 1 ? "it isn't" : "they aren't"} comparable.
          </>
        ) : (
          'Click a cycle to break it down below.'
        )}
      </figcaption>
    </figure>
  );
}
