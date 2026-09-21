import { describe, expect, it } from 'vitest';
import { RulesIdentityAdapter } from '@/adapters/identity/rules';
import type { ClaimedIdentity, ExtractedDocument } from '@/domain/types';

const rules = new RulesIdentityAdapter();

const CLAIMED: ClaimedIdentity = {
  fullName: 'ANA MEREANI NAIQAMA',
  dateOfBirth: '1991-03-14',
  documentNumber: 'FJ7481239',
};

function extracted(over: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    rawText: 'irrelevant to the rules',
    documentNumber: 'FJ7481239',
    fullName: 'ANA MEREANI NAIQAMA',
    dateOfBirth: '1991-03-14',
    confidence: 0.93,
    ...over,
  };
}

/**
 * The rules as a table, one row per reachable combination.
 *
 * A table rather than scattered assertions, because it is the only form in
 * which an unreachable combination is visible at a glance. Every row here
 * corresponds to a document quality the fixture renderer can actually produce.
 */
describe('identity decision rules', () => {
  it.each([
    // label, extracted overrides, claimed overrides, expected outcome, expected first reason
    ['a clean document with matching details', {}, {}, 'approved', undefined],
    ['a photograph-quality document', { confidence: 0.94 }, {}, 'approved', undefined],
    ['case and spacing differences in the name', {}, { fullName: 'ana  mereani naiqama' }, 'approved', undefined],
    ['punctuation in the typed name', {}, { fullName: "Ana-Mereani  Naiqama." }, 'approved', undefined],

    ['an illegible document', { confidence: 0.0, documentNumber: null, fullName: null, dateOfBirth: null }, {}, 'declined', 'document_unreadable'],
    ['confidence just below the decline threshold', { confidence: 0.29 }, {}, 'declined', 'document_unreadable'],
    ['a wrong document number', {}, { documentNumber: 'FJ0000000' }, 'declined', 'document_number_mismatch'],
    ['a wrong document number even at low confidence', { confidence: 0.45 }, { documentNumber: 'FJ0000000' }, 'declined', 'document_number_mismatch'],
    ['an entirely different name', {}, { fullName: 'PETER JOHN SMITH' }, 'declined', 'name_mismatch'],

    ['a smudged document, fields unread', { confidence: 0.55, documentNumber: null, fullName: null, dateOfBirth: null }, {}, 'referred', 'low_confidence'],
    ['confidence just below the referral threshold', { confidence: 0.59 }, {}, 'referred', 'low_confidence'],
    ['confident but the number did not parse', { documentNumber: null }, {}, 'referred', 'low_confidence'],
    ['confident but the name did not parse', { fullName: null }, {}, 'referred', 'low_confidence'],
    // Measured: a one-letter slip in a 19-character name scores 0.95 and is
    // approved, which is the intended behaviour. To reach the referral band a
    // name must differ substantially - this one scores 0.7368.
    ['a different surname on the same given names', {}, { fullName: 'ANA MEREANI DELANA' }, 'referred', 'name_mismatch'],
    ['a one-letter slip is approved, not referred', {}, { fullName: 'ANA MEREANI NAIQAMAR' }, 'approved', undefined],
    ['a mistyped date of birth', {}, { dateOfBirth: '1991-03-15' }, 'referred', 'dob_mismatch'],
  ])('%s -> %s', async (_label, over, claimedOver, expectedKind, expectedReason) => {
    const outcome = await rules.decide(
      { ...CLAIMED, ...(claimedOver as Partial<ClaimedIdentity>) },
      extracted(over as Partial<ExtractedDocument>),
    );
    expect(outcome.kind).toBe(expectedKind);
    if (expectedReason !== undefined && outcome.kind !== 'approved') {
      expect(outcome.reasons).toContain(expectedReason);
    }
  });

  it('reports both reasons when the name and the date are each wrong', async () => {
    const outcome = await rules.decide(
      { ...CLAIMED, fullName: 'ANA MEREANI DELANA', dateOfBirth: '1991-03-15' },
      extracted(),
    );
    expect(outcome.kind).toBe('referred');
    if (outcome.kind === 'referred') {
      expect(outcome.reasons).toContain('name_mismatch');
      expect(outcome.reasons).toContain('dob_mismatch');
    }
  });

  it('does not decline a smudged document for a name the reader could not read', async () => {
    // The failure this guards: comparing a claimed name against a null field
    // scores 0 and declines the applicant for the reader's failure.
    const outcome = await rules.decide(CLAIMED, extracted({
      confidence: 0.55, documentNumber: null, fullName: null, dateOfBirth: null,
    }));
    expect(outcome.kind).toBe('referred');
  });
});
