import { describe, expect, it } from 'vitest';
import { nameSimilarity, normaliseName } from '@/domain/similarity';

describe('name normalisation', () => {
  it('folds case, punctuation and repeated spaces', () => {
    expect(normaliseName("  Ana  Mereani   Naiqama ")).toBe('ANA MEREANI NAIQAMA');
    expect(normaliseName("O'Brien-Smith")).toBe('OBRIENSMITH');
  });
});

describe('name similarity', () => {
  it('scores an exact match as 1', () => {
    expect(nameSimilarity('ANA MEREANI NAIQAMA', 'ANA MEREANI NAIQAMA')).toBe(1);
  });

  it('ignores case and punctuation entirely', () => {
    expect(nameSimilarity('Ana Mereani Naiqama', 'ANA  MEREANI  NAIQAMA')).toBe(1);
  });

  it('scores a one-letter slip above the 0.85 approval threshold', () => {
    expect(nameSimilarity('NAIQAMA', 'NAIQAMAA')).toBeGreaterThanOrEqual(0.85);
  });

  it('scores a different name below the 0.60 decline threshold', () => {
    expect(nameSimilarity('ANA NAIQAMA', 'PETER SMITH')).toBeLessThan(0.6);
  });

  it('treats an empty comparison as no similarity rather than dividing by zero', () => {
    expect(nameSimilarity('', 'NAIQAMA')).toBe(0);
    expect(nameSimilarity('', '')).toBe(0);
  });
});
