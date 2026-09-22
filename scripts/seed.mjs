#!/usr/bin/env node
/**
 * Seeds the stack with synthetic data.
 *
 * Idempotent. A customer is matched by email before it is created, so running
 * this twice does not double the dataset. That matters because the most common
 * reason to run it is that the first run was interrupted.
 *
 * SYNTHETIC DATA ONLY. Every name, address and account is invented, and every
 * email address is under the reserved .test top-level domain.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEnvFile } from './lib/env-file.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Shared reader; the real environment still wins, as it did before.
const cfg = { ...readEnvFile(root).values, ...process.env };
const ODOO_URL = cfg.ODOO_URL ?? 'http://localhost:8069';
const ODOO_DB = cfg.ODOO_DB ?? 'vitiwai';
const ODOO_USER = cfg.ODOO_USER ?? 'admin';
const ODOO_PASSWORD = cfg.ODOO_PASSWORD ?? 'admin';
const MEILI_URL = cfg.MEILI_URL ?? 'http://localhost:7700';
const MEILI_KEY = cfg.MEILI_MASTER_KEY ?? '';
const CUSTOMERS = Number(cfg.SEED_CUSTOMERS ?? 200);
const SEED = Number(cfg.SEED_VALUE ?? 20260921);

// ---------------------------------------------------------------- Odoo -----

let uid;
async function rpc(service, method, args) {
  const response = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.data?.message ?? JSON.stringify(body.error));
  return body.result;
}

async function login() {
  if (uid !== undefined) return uid;
  uid = await rpc('common', 'login', [ODOO_DB, ODOO_USER, ODOO_PASSWORD]);
  if (!uid) throw new Error(`Odoo refused the credentials for "${ODOO_DB}". Run \`npm run init:odoo\`.`);
  return uid;
}

async function call(model, method, args, kwargs = {}) {
  const id = await login();
  return rpc('object', 'execute_kw', [ODOO_DB, id, ODOO_PASSWORD, model, method, args, kwargs]);
}

/** C1: create takes a list and returns a list of ids. */
async function createOne(model, values) {
  const created = await call(model, 'create', [[values]]);
  return Array.isArray(created) ? created[0] : created;
}

/** C2: the domain is exactly one positional argument. */
async function searchRead(model, domain, fields, options = {}) {
  return call(model, 'search_read', [domain], { fields, ...options });
}

async function waitForOdoo(seconds = 240) {
  for (let i = 0; i < seconds / 5; i += 1) {
    try {
      await rpc('common', 'version', []);
      return true;
    } catch {
      if (i === 0) process.stdout.write('waiting for Odoo');
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  return false;
}

// --------------------------------------------------------- Meilisearch -----

async function meili(path, init = {}) {
  const response = await fetch(`${MEILI_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(MEILI_KEY ? { authorization: `Bearer ${MEILI_KEY}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Meilisearch ${init.method ?? 'GET'} ${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function waitForTask(taskUid) {
  for (let i = 0; i < 120; i += 1) {
    const task = await meili(`/tasks/${taskUid}`);
    if (task.status === 'succeeded') return;
    if (task.status === 'failed') throw new Error(`Meilisearch task failed: ${JSON.stringify(task.error)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Meilisearch task ${taskUid} did not finish`);
}

// ------------------------------------------------------------- the run -----

// Node 26 strips TypeScript types natively, so this imports the generator the
// unit tests exercise rather than a mirrored JavaScript copy. One dataset, one
// source of truth.
const { generateDataset, TARIFF_MINOR_PER_KILOLITRE } = await import('../src/seed/generate.ts');

console.log('INFO - Vitiwai seed. SYNTHETIC DATA ONLY.');

if (!(await waitForOdoo())) {
  console.error(`\nFAIL - Odoo did not answer at ${ODOO_URL}. Run \`npm run stack:up\` first.`);
  process.exit(1);
}

const { plans, customers } = generateDataset(CUSTOMERS, SEED);

// -- plans into Meilisearch --------------------------------------------------

console.log(`INFO - indexing ${plans.length} plans into Meilisearch`);
await meili('/indexes', {
  method: 'POST',
  body: JSON.stringify({ uid: 'plans', primaryKey: 'id' }),
}).catch(() => undefined);

const settings = await meili('/indexes/plans/settings', {
  method: 'PATCH',
  body: JSON.stringify({
    searchableAttributes: ['name', 'description', 'category'],
    filterableAttributes: ['category', 'monthlyPriceMinor', 'downloadMbps'],
    sortableAttributes: ['monthlyPriceMinor'],
  }),
});
await waitForTask(settings.taskUid);

const documents = await meili('/indexes/plans/documents', {
  method: 'PUT',
  body: JSON.stringify(plans),
});
await waitForTask(documents.taskUid);
console.log(`PASS - ${plans.length} plans indexed`);

// -- customers and invoices into Odoo ---------------------------------------

console.log(`INFO - seeding ${customers.length} customers into Odoo. This takes a minute.`);

let created = 0;
let reused = 0;
let invoices = 0;
/** Invoice ids awaiting `action_post`. A draft invoice is a proposal, not a bill. */
const toPost = [];

for (const [index, customer] of customers.entries()) {
  const existing = await searchRead('res.partner', [['email', '=', customer.email]], ['id'], {
    limit: 1,
  });

  let partnerId;
  if (existing.length > 0) {
    partnerId = existing[0].id;
    reused += 1;
  } else {
    partnerId = await createOne('res.partner', {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      street: customer.street,
      customer_rank: 1,
      comment: `Synthetic record. Plan: ${customer.planId}.`,
    });
    created += 1;

    // Three most recent months become invoices, so a dashboard has something
    // to show without making 200 customers x 24 months of documents.
    for (const point of customer.usage.slice(-3)) {
      const invoiceId = await createOne('account.move', {
        move_type: 'out_invoice',
        partner_id: partnerId,
        invoice_date: `${point.month}-01`,
        invoice_line_ids: [
          [
            0,
            0,
            {
              name: `Water usage ${point.month} - ${point.kilolitres} kL`,
              quantity: point.kilolitres,
              price_unit: TARIFF_MINOR_PER_KILOLITRE / 100,
            },
          ],
        ],
      });
      toPost.push(invoiceId);
      invoices += 1;
    }
  }

  if ((index + 1) % 25 === 0) {
    process.stdout.write(`  ${index + 1}/${customers.length}\r`);
  }
}


// -- post the invoices ------------------------------------------------------
//
// Posting is what makes an invoice real. A draft has no reference, contributes
// nothing to the customer's balance, and is invisible to getUsage - which
// filters on `posted`. Increment 1A left all 620 in draft, so every dashboard
// figure would have read zero while agreeing with Odoo perfectly.
//
// Posted in batches: 620 single calls cost far more round trips than they need.
if (toPost.length > 0) {
  console.log(`INFO - posting ${toPost.length} invoices`);
  const BATCH = 50;
  for (let i = 0; i < toPost.length; i += BATCH) {
    await call('account.move', 'action_post', [toPost.slice(i, i + BATCH)]);
    process.stdout.write(`  ${Math.min(i + BATCH, toPost.length)}/${toPost.length}
`);
  }
  console.log(`
PASS - ${toPost.length} invoices posted`);
}

// Post anything still in draft, whoever created it.
//
// The block above posts only what this run created, and the guard below counts
// every draft in the database. Those two are not the same set: a run that
// created its invoices and then failed before posting them leaves drafts that
// no later run will ever adopt, because a later run creates nothing and so has
// nothing in `toPost`. The seed then failed on every subsequent invocation
// while describing itself as idempotent - measured 2026-09-23, 64 drafts left
// from an earlier run, and the customer dashboard showed no unpaid bill at all.
const orphanedDrafts = await call('account.move', 'search', [
  [['move_type', '=', 'out_invoice'], ['state', '=', 'draft']],
]);
if (orphanedDrafts.length > 0) {
  console.log(`INFO - posting ${orphanedDrafts.length} draft invoice(s) left by an earlier run`);
  const BATCH = 50;
  for (let i = 0; i < orphanedDrafts.length; i += BATCH) {
    await call('account.move', 'action_post', [orphanedDrafts.slice(i, i + BATCH)]);
  }
  console.log(`PASS - ${orphanedDrafts.length} draft invoice(s) posted`);
}

// The demo customer must owe something.
//
// `tests/contract/seed-state.test.ts` asserts a non-zero balance for this
// account, and the demonstration itself needs a bill to pay. Paying it - by
// hand during a demonstration, or by a test that drives the payment form -
// leaves the dataset in a state this script could not previously repair,
// because it creates invoices only for customers it creates and this one
// already exists. The suite then failed with nothing wrong in the code.
const demoEmail = process.env.DEMO_EMAIL ?? 'adi.baleiwai.19@example.test';
const demoPartner = await searchRead('res.partner', [['email', '=', demoEmail]], ['id'], { limit: 1 });
if (demoPartner.length > 0) {
  const outstanding = await call('account.move', 'search_count', [
    [
      ['move_type', '=', 'out_invoice'],
      ['partner_id', '=', demoPartner[0].id],
      ['state', '=', 'posted'],
      ['payment_state', '!=', 'paid'],
    ],
  ]);
  if (outstanding === 0) {
    const invoiceId = await createOne('account.move', {
      move_type: 'out_invoice',
      partner_id: demoPartner[0].id,
      invoice_date: new Date().toISOString().slice(0, 10),
      invoice_line_ids: [
        [0, 0, { name: 'Water usage - current period', quantity: 9, price_unit: TARIFF_MINOR_PER_KILOLITRE / 100 }],
      ],
    });
    await call('account.move', 'action_post', [[invoiceId]]);
    console.log(`PASS - issued a current bill for ${demoEmail}, which owed nothing`);
  }
}

// A guard, not a courtesy: a draft left behind is a dashboard figure that
// silently reads zero.
const stillDraft = await call('account.move', 'search_count', [
  [['move_type', '=', 'out_invoice'], ['state', '=', 'draft']],
]);
if (stillDraft > 0) {
  console.error(`FAIL - ${stillDraft} invoice(s) are still draft. The dashboard reads posted invoices only.`);
  process.exit(1);
}

console.log(`\nPASS - customers created ${created}, already present ${reused}, invoices created ${invoices}`);
console.log('INFO - re-running this script creates nothing further; it is idempotent.');
