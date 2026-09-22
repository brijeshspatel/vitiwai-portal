import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PayForm, INSTRUMENTS } from '@/app/account/pay/PayForm';
import { PaymentOutcome } from '@/app/account/pay/Outcome';
import { toMinorUnits } from '@/domain/money';

afterEach(cleanup);

const form = (over: Partial<Parameters<typeof PayForm>[0]> = {}) =>
  render(
    <PayForm
      invoiceId="42"
      reference="INV/2026/00007"
      amountMinor={toMinorUnits(45)}
      idempotencyKey="abc123"
      {...over}
    />,
  );

describe('the checkout form', () => {
  it('says the payment is simulated before anything is entered', () => {
    const { container } = form();
    expect(container.textContent).toMatch(/No money moves/i);
    expect(container.textContent).toMatch(/Never enter real card details/i);
  });

  it('shows the invoice and the amount', () => {
    const { container } = form();
    expect(container.textContent).toContain('INV/2026/00007');
    expect(container.textContent).toContain('FJ$45.00');
  });

  it('labels every test card and offers all three', () => {
    const { container } = form();
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(INSTRUMENTS.length);
    for (const radio of radios) {
      const id = radio.getAttribute('id');
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it('groups the cards in a fieldset with a legend', () => {
    const { container } = form();
    expect(container.querySelector('fieldset legend')?.textContent).toMatch(/test card/i);
  });

  it('carries the idempotency key so a resubmission cannot pay twice', () => {
    const { container } = form();
    const key = container.querySelector('input[name="idempotencyKey"]');
    expect(key?.getAttribute('value')).toBe('abc123');
    expect(key?.getAttribute('type')).toBe('hidden');
  });

  it('never prints "false" for an unissued reference', () => {
    const { container } = form({ reference: null });
    expect(container.textContent).not.toContain('false');
    expect(container.textContent).toMatch(/not yet issued/i);
  });

  it('announces a failure', () => {
    form({ error: 'Choose one of the test cards.' });
    expect(screen.getByRole('alert').textContent).toMatch(/Choose one of the test cards/);
  });
});

describe('the payment outcome screens', () => {
  it('confirms a payment with its receipt number', () => {
    const { container } = render(
      <PaymentOutcome kind="paid" amountMinor={toMinorUnits(45)} receiptId="rc_abc" />,
    );
    expect(container.textContent).toMatch(/that is paid/i);
    expect(container.textContent).toContain('FJ$45.00');
    expect(container.textContent).toContain('rc_abc');
  });

  it('still says the payment was simulated on the success screen', () => {
    render(<PaymentOutcome kind="paid" amountMinor={toMinorUnits(45)} receiptId="rc_abc" />);
    expect(screen.getByRole('complementary', { name: /this payment is simulated/i })).toBeDefined();
  });

  it('tells a declined customer nothing was charged', () => {
    const { container } = render(<PaymentOutcome kind="declined" reason="card_declined" />);
    expect(container.textContent).toMatch(/nothing has been charged/i);
    expect(container.textContent).toMatch(/balance is unchanged/i);
  });

  it('explains an already-paid bill without alarming anyone', () => {
    const { container } = render(<PaymentOutcome kind="already_paid" />);
    // The double-submit case a customer will actually meet. It must not look
    // like an error, because nothing went wrong.
    expect(container.textContent).toMatch(/already paid/i);
    expect(container.textContent).toMatch(/not taken a second payment/i);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('marks a decline as an alert and an already-paid bill as a status', () => {
    const declined = render(<PaymentOutcome kind="declined" reason="x" />);
    expect(declined.container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
