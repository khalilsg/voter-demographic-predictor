import type { Answers } from '../engine/types.js';

/**
 * Example profiles, chosen for what each one demonstrates rather than for being
 * representative of anybody.
 *
 * Selected by evaluating candidates against the fitted models and keeping the
 * ones that actually move. That filter matters more than it sounds: a profile
 * at 84% barely shifts however much the coefficients change underneath it,
 * because the logistic curve has flattened and there is no room left. The
 * visible movement lives near the middle of the range, so a preset chosen for
 * being politically vivid tends to produce a flat line and teach nothing.
 *
 * `look` is what to watch once it loads — the reason the profile is here.
 */
export interface Preset {
  id: string;
  label: string;
  look: string;
  answers: Answers;
}

export const PRESETS: Preset[] = [
  {
    id: 'noncollege',
    label: 'No degree, Midwest',
    look:
      'The largest move in the data: about 18 points away from the Democrats ' +
      'across the window, most of it between 2012 and 2016.',
    answers: {
      gender: 'woman', age: '45_64', race: 'white', educ: 'hs',
      income: 'middle', marstat: 'married', religion: 'catholic',
      bornagain: 'no', region: 'midwest', urbanicity: 'nonmetro',
    },
  },
  {
    id: 'union',
    label: 'Union household',
    look:
      'Down about 13 points — and 2008 disappears, because the CES did not ' +
      'ask about union membership that year.',
    answers: {
      gender: 'man', age: '45_64', race: 'white', educ: 'hs',
      income: 'middle', marstat: 'married', religion: 'catholic',
      bornagain: 'no', union_hh: 'current', region: 'midwest',
      urbanicity: 'small_metro',
    },
  },
  {
    id: 'hispanic-grad',
    label: 'Hispanic college graduate',
    look:
      'Up 18 points through 2020, then down 20 in a single cycle — the ' +
      'sharpest reversal any profile produces here.',
    answers: {
      gender: 'woman', age: '30_44', race: 'hispanic', educ: 'four_year',
      income: 'middle', marstat: 'married', religion: 'catholic',
      bornagain: 'no', region: 'west', urbanicity: 'large_metro',
    },
  },
  {
    id: 'postgrad-south',
    label: 'Postgraduate, South',
    look:
      'Moves the other way. Still Republican-leaning throughout, but drifting ' +
      'Democratic while less-educated profiles drift the opposite direction.',
    answers: {
      gender: 'man', age: '45_64', race: 'white', educ: 'postgrad',
      income: 'top20', marstat: 'married', religion: 'protestant',
      bornagain: 'no', region: 'south', urbanicity: 'large_metro',
    },
  },
  {
    id: 'black-voter',
    label: 'Black voter, the South',
    look:
      'Barely appears to move — but the underlying coefficient falls by more ' +
      'than a full log-odds. Near the ceiling, large changes buy almost no ' +
      'probability.',
    answers: {
      gender: 'woman', age: '30_44', race: 'black', educ: 'some_college',
      income: 'middle', marstat: 'not_married', religion: 'protestant',
      bornagain: 'no', region: 'south', urbanicity: 'small_metro',
    },
  },
];
