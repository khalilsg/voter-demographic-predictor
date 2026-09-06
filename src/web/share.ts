import type { Answers, Question } from '../engine/types.js';

/**
 * Answers <-> URL, so a profile can be sent to someone.
 *
 * Encoded as ordinary query pairs after `#/p/`, which keeps links readable and
 * debuggable ("gender=woman&educ=postgrad") and makes them order-independent.
 * Decoding validates against the loaded question set and silently drops
 * anything unrecognised, so an old link still opens after a refit changes a
 * level id — worse to fail loudly on a shared URL than to open with one
 * question blank.
 */
export const PROFILE_PREFIX = 'p/';

export function encodeAnswers(answers: Answers): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(answers)) {
    if (v !== undefined) params.set(k, v);
  }
  return params.toString();
}

export function decodeAnswers(encoded: string, questions: Question[]): Answers {
  const out: Answers = {};
  for (const [featureId, levelId] of new URLSearchParams(encoded)) {
    const q = questions.find((x) => x.id === featureId);
    if (q?.levels.some((l) => l.id === levelId)) out[featureId] = levelId;
  }
  return out;
}

/** The full shareable URL for an answer set, or the bare page when empty. */
export function profileUrl(answers: Answers): string {
  const encoded = encodeAnswers(answers);
  const base = `${window.location.origin}${window.location.pathname}`;
  return encoded ? `${base}#/${PROFILE_PREFIX}${encoded}` : base;
}
