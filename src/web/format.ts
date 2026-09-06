export const pct = (p: number): string => `${(p * 100).toFixed(0)}%`;

export const leanLabel = (p: number): string => {
  if (p >= 0.65) return 'Strongly Democratic';
  if (p >= 0.55) return 'Leans Democratic';
  if (p > 0.45) return 'Toss-up';
  if (p > 0.35) return 'Leans Republican';
  return 'Strongly Republican';
};

/** Blue for Democratic, red for Republican, muted in the middle. */
export const leanColor = (p: number): string => {
  const t = Math.max(-1, Math.min(1, (p - 0.5) * 4));
  return t >= 0
    ? `color-mix(in oklab, var(--dem) ${Math.round(t * 100)}%, var(--neutral))`
    : `color-mix(in oklab, var(--gop) ${Math.round(-t * 100)}%, var(--neutral))`;
};
