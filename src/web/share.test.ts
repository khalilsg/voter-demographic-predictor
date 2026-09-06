import { describe, expect, it } from 'vitest';
import { MODELS } from '../engine/models.js';
import { questions } from '../engine/predict.js';
import { decodeAnswers, encodeAnswers } from './share.js';
import { PRESETS } from './presets.js';

const QUESTIONS = questions(MODELS);

describe('shareable profiles', () => {
  it('round-trips every preset', () => {
    for (const p of PRESETS) {
      expect(decodeAnswers(encodeAnswers(p.answers), QUESTIONS)).toEqual(p.answers);
    }
  });

  it('is order-independent', () => {
    const a = decodeAnswers('gender=woman&educ=postgrad', QUESTIONS);
    const b = decodeAnswers('educ=postgrad&gender=woman', QUESTIONS);
    expect(a).toEqual(b);
  });

  it('drops unknown questions and levels instead of failing', () => {
    // An old link must still open after a refit renames something.
    const got = decodeAnswers(
      'gender=woman&phrenology=bumpy&educ=doctorate_of_vibes',
      QUESTIONS,
    );
    expect(got).toEqual({ gender: 'woman' });
  });

  it('encodes nothing for an empty answer set', () => {
    expect(encodeAnswers({})).toBe('');
    expect(encodeAnswers({ gender: undefined })).toBe('');
  });

  it('survives a hostile string', () => {
    expect(() => decodeAnswers('=&&%%%=x&a=b=c', QUESTIONS)).not.toThrow();
    expect(decodeAnswers('=&&%%%=x&a=b=c', QUESTIONS)).toEqual({});
  });
});
