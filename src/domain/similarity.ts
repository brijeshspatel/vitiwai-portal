/**
 * Name comparison for the identity decision.
 *
 * A customer typing their own name will differ from the card in case, spacing
 * and punctuation far more often than in letters. Normalising those away first
 * means the similarity score measures what it is meant to measure.
 */

/** Upper-cases, strips anything that is not a letter or a space, collapses spaces. */
export function normaliseName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance, iterative with two rows so long names cost little. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] as number) + 1;
      const deletion = (previous[j] as number) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length] as number;
}

/**
 * 1 for identical names after normalisation, 0 for nothing in common.
 *
 * An empty name on either side scores 0 rather than 1: a missing name is not a
 * match, and returning 1 would approve an application the card never supported.
 */
export function nameSimilarity(claimed: string, extracted: string): number {
  const a = normaliseName(claimed);
  const b = normaliseName(extracted);
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}
