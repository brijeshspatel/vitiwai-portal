import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFile, readEnvFile } from '../../scripts/lib/env-file.mjs';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'envfile-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readEnvFile', () => {
  it('parses simple assignments', () => {
    writeFileSync(join(dir, '.env'), 'A=1\nB=two\n');
    const { sources, values } = readEnvFile(dir);
    expect(sources).toEqual(['.env']);
    expect(values).toEqual({ A: '1', B: 'two' });
  });

  it('ignores comments and blank lines', () => {
    writeFileSync(join(dir, '.env'), '# a comment\n\nA=1\n   \n# another\nB=2\n');
    expect(readEnvFile(dir).values).toEqual({ A: '1', B: '2' });
  });

  it('keeps everything after the first equals sign', () => {
    // A connection string is the case that breaks a naive split on "=".
    writeFileSync(join(dir, '.env'), 'URL=postgres://u:p@host:15432/db?opt=1\n');
    expect(readEnvFile(dir).values.URL).toBe('postgres://u:p@host:15432/db?opt=1');
  });

  it('strips one layer of surrounding quotes', () => {
    writeFileSync(join(dir, '.env'), "A='single'\nB=\"double\"\nC=bare\n");
    expect(readEnvFile(dir).values).toEqual({ A: 'single', B: 'double', C: 'bare' });
  });

  it('falls back to .env.example and says which file it read', () => {
    writeFileSync(join(dir, '.env.example'), 'A=fallback\n');
    const { sources, values } = readEnvFile(dir);
    expect(sources).toEqual(['.env.example']);
    expect(values.A).toBe('fallback');
  });

  it('merges per key, so a partial .env still resolves the rest', () => {
    // This is the behaviour init-odoo.mjs and seed.mjs already had. Taking the
    // first file whole, as check-ports.mjs did, would leave B undefined.
    writeFileSync(join(dir, '.env.example'), 'A=example\nB=only_in_example\n');
    writeFileSync(join(dir, '.env'), 'A=real\n');
    const { sources, values } = readEnvFile(dir);
    expect(sources).toEqual(['.env.example', '.env']);
    expect(values).toEqual({ A: 'real', B: 'only_in_example' });
  });

  it('prefers .env over .env.example when both exist', () => {
    writeFileSync(join(dir, '.env.example'), 'A=fallback\n');
    writeFileSync(join(dir, '.env'), 'A=real\n');
    expect(readEnvFile(dir).values.A).toBe('real');
  });

  it('returns no sources rather than throwing when neither file exists', () => {
    const { sources, values } = readEnvFile(dir);
    expect(sources).toEqual([]);
    expect(values).toEqual({});
  });
});

describe('loadEnvFile', () => {
  it('never overwrites a variable already in the real environment', () => {
    writeFileSync(join(dir, '.env'), 'ENVFILE_TEST_KEEP=from_file\nENVFILE_TEST_NEW=from_file\n');
    process.env.ENVFILE_TEST_KEEP = 'from_environment';
    delete process.env.ENVFILE_TEST_NEW;
    try {
      const { applied } = loadEnvFile(dir);
      expect(process.env.ENVFILE_TEST_KEEP).toBe('from_environment');
      expect(process.env.ENVFILE_TEST_NEW).toBe('from_file');
      expect(applied).toEqual(['ENVFILE_TEST_NEW']);
    } finally {
      delete process.env.ENVFILE_TEST_KEEP;
      delete process.env.ENVFILE_TEST_NEW;
    }
  });
});
