import { describe, expect, it, vi } from 'vitest';
import { recordEvent, redact } from '@/audit/record';

describe('what the trail refuses to carry', () => {
  it('drops anything whose key suggests a credential or a document', () => {
    const safe = redact({
      email: 'a@b.test',
      password: 'hunter2',
      sessionId: 'abc',
      csrfToken: 'xyz',
      documentBytes: 'AAAA',
      imageData: 'BBBB',
      accessToken: 'ccc',
      outcome: 'approved',
    });
    expect(Object.keys(safe).sort()).toEqual(['email', 'outcome']);
  });

  it('keeps the context that makes a row useful', () => {
    // A redactor that dropped everything would satisfy the case above.
    const safe = redact({ outcome: 'declined', amountMinor: 2250, invoiceId: 'INV/1' });
    expect(safe).toEqual({ outcome: 'declined', amountMinor: 2250, invoiceId: 'INV/1' });
  });
});

describe('writing a row', () => {
  it('sends the redacted detail, not the original', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await recordEvent({ query }, {
      action: 'signin.succeeded',
      actorUser: 7,
      subjectType: 'session',
      detail: { email: 'a@b.test', password: 'hunter2' },
    });
    const detail = JSON.parse(query.mock.calls[0]![1]![4] as string);
    expect(detail).toEqual({ email: 'a@b.test' });
  });

  it('never throws, so a failed log cannot undo a completed payment', async () => {
    const query = vi.fn().mockRejectedValue(new Error('database is gone'));
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      recordEvent({ query }, { action: 'payment.recorded', subjectType: 'invoice' }),
    ).resolves.toBeUndefined();
    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });
});
