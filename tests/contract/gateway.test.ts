import { beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { MockGatewayAdapter } from '@/adapters/payment/mock';
import { isErr, isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const gateway = new MockGatewayAdapter(env.GATEWAY_URL);

const unique = () => `INV-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  const health = await fetch(`${env.GATEWAY_URL}/healthz`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`the gateway is not reachable at ${env.GATEWAY_URL}. Run \`npm run stack:up\`.`);
  }
}, 60_000);

describe('MockGatewayAdapter', () => {
  it('creates an intent that is not yet confirmed', async () => {
    const result = await gateway.createIntent(toMinorUnits(45.5), unique());
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.status).toBe('requires_confirmation');
    expect(result.value.amountMinor).toBe(4550);
    expect(result.value.id).toMatch(/^pi_/);
  });

  it('carries the simulated flag through, rather than dropping it', async () => {
    // Nothing downstream may lose track of what it is talking to.
    const result = await gateway.createIntent(toMinorUnits(10), unique());
    if (!isOk(result)) return;
    expect(result.value.simulated).toBe(true);
  });

  it('confirms a good instrument and returns a receipt', async () => {
    const intent = await gateway.createIntent(toMinorUnits(60), unique());
    if (!isOk(intent)) throw new Error('could not create the intent');

    const receipt = await gateway.confirmIntent(intent.value.id, 'pm_test_ok');
    expect(isOk(receipt)).toBe(true);
    if (!isOk(receipt)) return;
    expect(receipt.value.paidMinor).toBe(6000);
    expect(receipt.value.id).toMatch(/^rc_/);
    expect(receipt.value.simulated).toBe(true);
  });

  it('declines a declining card and names the reason', async () => {
    const intent = await gateway.createIntent(toMinorUnits(60), unique());
    if (!isOk(intent)) return;

    const result = await gateway.confirmIntent(intent.value.id, 'pm_test_decline');
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe('declined');
    expect(result.error.message).toContain('card_declined');
  });

  it('declines for insufficient funds with its own reason', async () => {
    const intent = await gateway.createIntent(toMinorUnits(60), unique());
    if (!isOk(intent)) return;

    const result = await gateway.confirmIntent(intent.value.id, 'pm_test_insufficient');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toContain('insufficient_funds');
  });

  it('refuses to confirm the same intent twice', async () => {
    const intent = await gateway.createIntent(toMinorUnits(20), unique());
    if (!isOk(intent)) return;

    const first = await gateway.confirmIntent(intent.value.id, 'pm_test_ok');
    expect(isOk(first)).toBe(true);

    const second = await gateway.confirmIntent(intent.value.id, 'pm_test_ok');
    expect(isErr(second)).toBe(true);
    if (isErr(second)) expect(second.error.kind).toBe('already_resolved');
  });

  it('reports an unknown intent as not found', async () => {
    const result = await gateway.confirmIntent('pi_does_not_exist', 'pm_test_ok');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('not_found');
  });

  it('refuses a non-positive amount', async () => {
    const result = await gateway.createIntent(0 as never, unique());
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('invalid_request');
  });

  it('returns a Result rather than throwing when the gateway is down', async () => {
    const offline = new MockGatewayAdapter('http://localhost:8099', 2000);
    const result = await offline.createIntent(toMinorUnits(10), unique());
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe('unavailable');
  });
});
