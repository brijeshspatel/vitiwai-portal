/**
 * Contract tests for the Odoo adapters.
 *
 * These run against the live stack. Each assertion below corresponds to a call
 * convention (C1 to C4) that broke a probe written from the obvious assumption
 * on 2026-09-21, so these are regression tests for real mistakes rather than
 * decoration.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';
import { createOdooClient } from '@/adapters/odoo/client';
import { OdooCustomerAdapter } from '@/adapters/odoo/customer';
import { OdooCaseAdapter } from '@/adapters/odoo/case';
import { isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const client = createOdooClient(env);
const customers = new OdooCustomerAdapter(client);
const cases = new OdooCaseAdapter(client);

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  const reachable = await client.ping();
  if (!reachable) {
    throw new Error(
      `Odoo is not reachable at ${env.ODOO_URL}. Run \`npm run stack:up\` and \`npm run seed\` first.`,
    );
  }
}, 120_000);

describe('Odoo call conventions', () => {
  it('C1: create returns an id, not the list Odoo actually sends back', async () => {
    const result = await customers.createCustomer({
      name: `Contract Test ${unique()}`,
      email: `contract-${unique()}@example.test`,
      city: 'Suva',
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    // Odoo's JSON-RPC `create` accepts a list of dicts and returns a list of
    // ids, even for one record. An adapter that passed the return value through
    // would hand callers `[6]` where `6` was meant.
    expect(typeof result.value).toBe('string');
    expect(result.value).not.toMatch(/[[\]]/);
    expect(Number(result.value)).toBeGreaterThan(0);
  });

  it('C2: a search domain is one positional argument', async () => {
    const email = `findme-${unique()}@example.test`;
    const created = await customers.createCustomer({ name: 'Findable', email });
    expect(isOk(created)).toBe(true);

    // Double-wrapping the domain raises `Domain() invalid item in domain`.
    // Reaching this assertion at all is the proof that it is wrapped correctly.
    const found = await customers.findCustomerByEmail(email);
    expect(isOk(found)).toBe(true);
    if (isOk(found)) {
      expect(found.value).not.toBeNull();
      expect(found.value?.email).toBe(email);
    }
  });

  it('C2b: an absent record is a null answer, not an error', async () => {
    const found = await customers.findCustomerByEmail(`nobody-${unique()}@example.test`);
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value).toBeNull();
  });

  it('C3: a draft invoice surfaces as null reference, never the string "false"', async () => {
    const email = `invoiced-${unique()}@example.test`;
    const created = await customers.createCustomer({ name: 'Invoice Target', email });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const draftId = await client.createDraftInvoice(created.value, toMinorUnits(45.5));
    const invoices = await customers.listInvoices(created.value);
    expect(isOk(invoices)).toBe(true);
    if (!isOk(invoices)) return;

    const draft = invoices.value.find((i) => i.id === draftId);
    expect(draft).toBeDefined();
    expect(draft?.status).toBe('draft');
    expect(draft?.reference).toBeNull();
    // The exact defect this guards: rendering Odoo's `false` verbatim.
    expect(String(draft?.reference)).not.toBe('false');
  });

  it('C4: one session authenticates once, not once per call', async () => {
    const before = client.authenticationCount();
    await customers.findCustomerByEmail(`a-${unique()}@example.test`);
    await customers.findCustomerByEmail(`b-${unique()}@example.test`);
    await customers.findCustomerByEmail(`c-${unique()}@example.test`);
    expect(client.authenticationCount()).toBe(before);
  });
});

describe('support cases and leads use the models Community actually ships', () => {
  it('opens a fault report as a project.task', async () => {
    const email = `faulty-${unique()}@example.test`;
    const created = await customers.createCustomer({ name: 'Fault Reporter', email });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const opened = await cases.openCase({
      customerId: created.value,
      title: 'No water since Tuesday',
      description: 'Supply stopped at the meter. Synthetic test record.',
    });
    expect(isOk(opened)).toBe(true);

    const listed = await cases.listCases(created.value);
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.value.length).toBeGreaterThan(0);
      expect(listed.value[0]?.title).toContain('No water');
      // Odoo 19 creates a task in `01_in_progress`; it has no `new` state.
      // Read from fields_get on the running instance, not assumed.
      expect(listed.value[0]?.status).toBe('in_progress');
    }
  });

  it('raises a plan change as a crm.lead', async () => {
    const email = `upgrader-${unique()}@example.test`;
    const created = await customers.createCustomer({ name: 'Plan Changer', email });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const lead = await cases.createLead({
      customerId: created.value,
      title: 'Requests the 100 Mbps bundle',
      requestedPlanId: 'plan-bundle-100',
    });
    expect(isOk(lead)).toBe(true);
  });
});
