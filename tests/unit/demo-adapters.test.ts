import { describe, expect, it } from 'vitest';
import { DemoSearchAdapter } from '@/adapters/demo/search';
import { DemoPaymentAdapter } from '@/adapters/demo/payment';
import { UnavailableOcrAdapter } from '@/adapters/demo/ocr';
import { isErr, isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';
import type { Money } from '@/domain/money';

/**
 * The adapters a public demonstration runs on.
 *
 * Only the three that need no database are here. The customer and case
 * adapters talk to Postgres and are exercised by the browser suite against a
 * real one, because a mocked pool would test the mock.
 */

describe('the demonstration plan search', () => {
  const search = new DemoSearchAdapter();

  it('returns the whole catalogue when nothing is asked of it', async () => {
    const result = await search.searchPlans({});
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.items.length).toBeGreaterThan(0);
    expect(result.value.total).toBe(result.value.items.length);
  });

  it('is deterministic, so a demonstration shows the same plans every time', async () => {
    const a = await new DemoSearchAdapter().searchPlans({});
    const b = await new DemoSearchAdapter().searchPlans({});
    expect(isOk(a) && isOk(b)).toBe(true);
    if (!isOk(a) || !isOk(b)) return;
    expect(a.value.items.map((p) => p.id)).toEqual(b.value.items.map((p) => p.id));
  });

  it('filters by category', async () => {
    const result = await search.searchPlans({ category: 'broadband' });
    if (!isOk(result)) throw new Error('expected a result');
    expect(result.value.items.length).toBeGreaterThan(0);
    expect(result.value.items.every((p) => p.category === 'broadband')).toBe(true);
  });

  it('filters by price, inclusive of the bound', async () => {
    const cap = toMinorUnits(60);
    const result = await search.searchPlans({ maxMonthlyPriceMinor: cap });
    if (!isOk(result)) throw new Error('expected a result');
    expect(result.value.items.every((p) => p.monthlyPriceMinor <= cap)).toBe(true);
  });

  it('matches text in the name or the description, ignoring case', async () => {
    const result = await search.searchPlans({ text: 'BROADBAND' });
    if (!isOk(result)) throw new Error('expected a result');
    expect(result.value.items.length).toBeGreaterThan(0);
    expect(
      result.value.items.every((p) =>
        `${p.name} ${p.description}`.toLowerCase().includes('broadband'),
      ),
    ).toBe(true);
  });

  it('reports the total that matched, not the number returned', async () => {
    const all = await search.searchPlans({});
    if (!isOk(all)) throw new Error('expected a result');
    const paged = await search.searchPlans({ limit: 2 });
    if (!isOk(paged)) throw new Error('expected a result');

    // A caller paging through results cannot do so if `total` shrinks to the
    // size of the page it was given.
    expect(paged.value.items).toHaveLength(2);
    expect(paged.value.total).toBe(all.value.total);
  });

  it('answers an unmatched search with an empty page rather than an error', async () => {
    const result = await search.searchPlans({ text: 'there-is-no-such-plan' });
    if (!isOk(result)) throw new Error('expected a result');
    expect(result.value.items).toEqual([]);
    expect(result.value.total).toBe(0);
  });
});

describe('the demonstration payment gateway', () => {
  const amount = toMinorUnits(45.5);

  it('creates an intent that requires confirmation, and says it is simulated', async () => {
    const gateway = new DemoPaymentAdapter();
    const intent = await gateway.createIntent(amount, 'inv-1');
    if (!isOk(intent)) throw new Error('expected an intent');
    expect(intent.value.status).toBe('requires_confirmation');
    expect(intent.value.simulated).toBe(true);
    expect(intent.value.amountMinor).toBe(amount);
  });

  it('refuses an intent for nothing', async () => {
    const gateway = new DemoPaymentAdapter();
    const intent = await gateway.createIntent(0 as Money, 'inv-1');
    expect(isErr(intent)).toBe(true);
    if (!isErr(intent)) return;
    expect(intent.error.kind).toBe('invalid_request');
  });

  it('settles a good instrument, and the receipt says it is simulated', async () => {
    const gateway = new DemoPaymentAdapter();
    const intent = await gateway.createIntent(amount, 'inv-1');
    if (!isOk(intent)) throw new Error('expected an intent');
    const receipt = await gateway.confirmIntent(intent.value.id, 'pm_test_ok');
    if (!isOk(receipt)) throw new Error('expected a receipt');
    expect(receipt.value.paidMinor).toBe(amount);
    expect(receipt.value.simulated).toBe(true);
    expect(receipt.value.intentId).toBe(intent.value.id);
  });

  it.each(['pm_test_decline', 'pm_test_insufficient'] as const)('declines %s', async (instrument) => {
    const gateway = new DemoPaymentAdapter();
    const intent = await gateway.createIntent(amount, 'inv-1');
    if (!isOk(intent)) throw new Error('expected an intent');
    const outcome = await gateway.confirmIntent(intent.value.id, instrument);
    expect(isErr(outcome)).toBe(true);
    if (!isErr(outcome)) return;
    expect(outcome.error.kind).toBe('declined');
  });

  it('refuses to confirm the same intent twice', async () => {
    // The double submit a customer produces by refreshing. Refusing it here is
    // what makes the idempotency key above this layer mean anything.
    const gateway = new DemoPaymentAdapter();
    const intent = await gateway.createIntent(amount, 'inv-1');
    if (!isOk(intent)) throw new Error('expected an intent');
    await gateway.confirmIntent(intent.value.id, 'pm_test_ok');
    const again = await gateway.confirmIntent(intent.value.id, 'pm_test_ok');
    expect(isErr(again)).toBe(true);
    if (!isErr(again)) return;
    expect(again.error.kind).toBe('already_resolved');
  });

  it('refuses to confirm an intent it never issued', async () => {
    const gateway = new DemoPaymentAdapter();
    const outcome = await gateway.confirmIntent('pi_demo_nonexistent', 'pm_test_ok');
    expect(isErr(outcome)).toBe(true);
    if (!isErr(outcome)) return;
    expect(outcome.error.kind).toBe('not_found');
  });

  it('does not resolve an intent that was declined, twice over', async () => {
    const gateway = new DemoPaymentAdapter();
    const intent = await gateway.createIntent(amount, 'inv-1');
    if (!isOk(intent)) throw new Error('expected an intent');
    await gateway.confirmIntent(intent.value.id, 'pm_test_decline');
    const again = await gateway.confirmIntent(intent.value.id, 'pm_test_ok');
    // A decline resolves the intent. Retrying with a different card is a new
    // intent, not a second attempt at the old one.
    expect(isErr(again)).toBe(true);
    if (!isErr(again)) return;
    expect(again.error.kind).toBe('already_resolved');
  });
});

describe('the OCR port in a build that accepts no documents', () => {
  it('refuses, rather than returning something that looks like a reading', async () => {
    const ocr = new UnavailableOcrAdapter();
    const result = await ocr.read();
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe('unavailable');
    // The message has to say why, because reaching it means a build that takes
    // no documents has been asked to read one.
    expect(result.error.message).toMatch(/no identity documents/i);
  });
});
