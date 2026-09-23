import pg from 'pg';
import { parseEnv } from '@/config/env';
import { DEMO_EMAIL, DEMO_PASSWORD, isDemoBuild } from './browser';
import { createOdooClient } from '@/adapters/odoo/client';
import { OdooCustomerAdapter } from '@/adapters/odoo/customer';
import { isOk } from '@/domain/result';
import { toMinorUnits } from '@/domain/money';
import { hashPassword } from '@/domain/password';

/**
 * Creates a customer who owes money, for the payment journey to pay.
 *
 * The journey used to sign in as the shared demo account and pay its bill.
 * That worked once. It then left the account owing nothing, which broke
 * `tests/contract/seed-state.test.ts` - a test that asserts the seeded customer
 * has a non-zero balance - and the breakage appeared in a suite that had not
 * changed, blaming code that was correct.
 *
 * The contract suite had already solved this: its payment tests create their own
 * "Invoice Target" customers rather than spending the seeded one. This does the
 * same for the browser suite.
 *
 * A test that consumes shared state has to bring its own.
 */

const env = parseEnv({ ...process.env } as Record<string, string | undefined>);
const client = createOdooClient(env);
const customers = new OdooCustomerAdapter(client);

export type Payable = { email: string; password: string; amountMinor: number };

export async function createPayableCustomer(): Promise<Payable> {
  // A demonstration build has no Odoo to create a customer in, and does not
  // need one: its customers are generated, and the account the container
  // publishes already owns three invoices.
  //
  // What it does need is those invoices unpaid. Paying one writes a row to
  // `payment`, and the demonstration reads an invoice's paid state back from
  // that table - so a second run of this file would find nothing to pay, just
  // as the seeded account did before this helper existed. Clearing the rows
  // this suite wrote is the harness admitting it is a harness, exactly as
  // `clearSignInBudget` does.
  if (await isDemoBuild()) return restoreDemoInvoices();

  const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `browser-payer-${unique}@example.test`;
  const password = 'demo-passphrase';
  const amountMinor = toMinorUnits(45.5);

  const created = await customers.createCustomer({ name: 'Browser Payment Target', email });
  if (!isOk(created)) throw new Error(`could not create a customer: ${created.error.message}`);
  const partnerId = created.value;

  const invoiceId = await client.createDraftInvoice(partnerId, amountMinor);

  // A draft invoice is a proposal, not a bill: it has no reference, adds
  // nothing to the balance, and the dashboard filters on `posted`. Without this
  // the customer is created and still owes nothing, which is the same failure
  // in a new place.
  await client.call('account.move', 'action_post', [[Number(invoiceId)]]);

  // A seeded customer has no portal credential - those come from onboarding.
  // Written directly, as `scripts/demo-credential.mjs` does, and for the same
  // reason: this is a harness giving synthetic data a way in.
  const pool = new pg.Pool({ connectionString: env.PORTAL_DATABASE_URL });
  try {
    await pool.query(
      'INSERT INTO portal_user (email, password_hash, odoo_partner_id) VALUES ($1, $2, $3)',
      [email, await hashPassword(password), Number(partnerId)],
    );
  } finally {
    await pool.end();
  }

  return { email, password, amountMinor };
}

/** The demonstration account, with the invoices this suite has paid restored. */
async function restoreDemoInvoices(): Promise<Payable> {
  const pool = new pg.Pool({ connectionString: env.PORTAL_DATABASE_URL });
  try {
    // Only this customer's invoices, and only rows a payment created. A
    // narrower delete than `TRUNCATE payment` on purpose: the audit trail and
    // any other customer's history are not this test's to remove.
    await pool.query("DELETE FROM payment WHERE invoice_id LIKE 'demo-inv-0-%'");
  } finally {
    await pool.end();
  }
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD, amountMinor: toMinorUnits(0) };
}
