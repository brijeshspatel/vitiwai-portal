import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Three files carry the release number and nothing keeps them together. They
// drifted once: `VERSION` and `CHANGELOG.md` reached 0.4.0 while `package.json`
// and its lock stayed at 0.2.0 through two releases, and the check that was
// meant to catch it passed after reading only the first two.
const root = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');

const version = root('VERSION').trim();

describe('the release number', () => {
  it('is a plain semantic version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is the same in package.json', () => {
    expect(JSON.parse(root('package.json')).version).toBe(version);
  });

  it('is the same in the lock file, at both places it appears', () => {
    const lock = JSON.parse(root('package-lock.json'));
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it('has an entry in the changelog', () => {
    expect(root('CHANGELOG.md')).toContain(`## [${version}]`);
  });
});
