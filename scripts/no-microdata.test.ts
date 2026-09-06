import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The privacy rule of this project — no survey microdata in the repository —
 * is the one invariant whose violation cannot be undone by a later commit.
 * Once a respondent-level file is pushed it is in the history, in every clone,
 * and in GitHub's fork network.
 *
 * A comment in .gitignore cannot enforce that, so these tests do. They check
 * what git ACTUALLY tracks and what the rules ACTUALLY ignore, rather than
 * trusting the patterns to be right.
 */

const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', cwd: process.cwd() });

const tracked = (): string[] =>
  git('ls-files').split('\n').filter(Boolean);

/** Formats survey microdata plausibly arrives in. */
const MICRODATA_EXT =
  /\.(dta|sav|por|rds|rdata|tab|csv|tsv|zip|gz|7z|parquet|feather)$/i;

describe('no microdata in the repository', () => {
  it('tracks no file in a microdata format', () => {
    const offenders = tracked().filter((f) => MICRODATA_EXT.test(f));
    expect(offenders).toEqual([]);
  });

  it('tracks nothing large enough to hold respondent rows', () => {
    // The lockfile is the only legitimately large tracked file.
    const big = tracked()
      .filter((f) => f !== 'package-lock.json')
      .filter((f) => statSync(f).size > 64 * 1024);
    expect(big).toEqual([]);
  });

  it('ignores microdata wherever it lands, not just under data/raw/', () => {
    // Dataverse hands you dataverse_files.zip and exports .tab, so these are
    // the likely real filenames rather than contrived ones.
    const decoys = [
      'data/raw/cumulative_ces.dta',
      'data/raw/nested/deep.tab',
      'cumulative_ces.dta',
      'ces_export.sav',
      'ces.rds',
      'ces.RData',
      'ces.tab',
      'ces.csv',
      'dataverse_files.zip',
    ];
    const exposed = decoys.filter((f) => {
      try {
        git('check-ignore', '-q', '--no-index', f);
        return false;
      } catch {
        return true;
      }
    });
    expect(exposed).toEqual([]);
  });

  it('still allows the fitted coefficient files through', () => {
    // A rule broad enough to block everything would also block the deliverable.
    let ignored = true;
    try {
      git('check-ignore', '-q', '--no-index', 'data/models/2020.json');
    } catch {
      ignored = false;
    }
    expect(ignored).toBe(false);
    expect(tracked()).toContain('data/models/2020.json');
  });

  it('model files carry only aggregate fields', () => {
    // Guards against a future fit script accidentally serialising rows.
    const ALLOWED = new Set([
      'year', 'intercept', 'features', 'meta',
      'id', 'label', 'question', 'levels', 'coef', 'share',
      'n', 'source', 'synthetic',
    ]);
    for (const f of tracked().filter((p) => p.startsWith('data/models/'))) {
      const keys = new Set<string>();
      const walk = (v: unknown): void => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (v && typeof v === 'object') {
          for (const [k, child] of Object.entries(v)) {
            keys.add(k);
            walk(child);
          }
        }
      };
      walk(JSON.parse(readFileSync(f, 'utf8')));
      expect([...keys].filter((k) => !ALLOWED.has(k)), `unexpected key in ${f}`).toEqual([]);
    }
  });
});
