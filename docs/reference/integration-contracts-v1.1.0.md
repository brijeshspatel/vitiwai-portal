---
doc_id: reference-integration-contracts
title: "Integration contracts - Vitiwai portal"
type: reference
version: 1.1.0
status: active
created: 2026-09-21
updated: 2026-09-21
supersedes: null
superseded_by: null
change_summary: "Adds the ocr and docgen services delivered in increment 1B, with their measured confidence bands, replacing the two placeholder port sections."
---

# Integration contracts

One section per port. Each says whether the system behind it is real or simulated, and records the
behaviour the adapter depends on.

## ErpCustomerPort and CrmCasePort - Odoo 19 Community

**Real.** Self-hosted, `odoo:19.0`, reporting `19.0-20260908` over JSON-RPC.
Endpoint `POST /jsonrpc`. No account, no licence fee, no outbound dependency.

### Call conventions, found by execution

These were found on 2026-09-21 by calling a running instance. Each one broke a probe written from
the obvious assumption, so each is handled in `src/adapters/odoo/client.ts` rather than repeated in
every adapter.

| # | Behaviour | What the adapter does |
|---|---|---|
| C1 | `create` accepts a **list** of value dictionaries and returns a **list** of ids, even for one record | `createOne` takes the first element. Passing the value through hands callers `[6]` where `6` was meant |
| C2 | The search domain is **one positional argument**. Double-wrapping raises `Domain() invalid item in domain` | `searchRead` wraps the domain once, centrally, so no caller can get it wrong. The empty domain is `[]` |
| C3 | A draft `account.move` has `name: false`, not a string | `optionalString` turns Odoo's `false` into `null` at the boundary, so no view can render `"false"` to a customer |
| C4 | `login` returns a numeric `uid` used on every later call | The `uid` is cached for the life of the client, not fetched per request |

### Models, and one that is not available

Read from `ir.module.module` on the running instance:

| Module | State |
|---|---|
| `crm` | installed |
| `account` | installed |
| `project` | installed |
| `helpdesk` | **uninstallable** |

`helpdesk` is an Enterprise module. Community does not merely lack it - it reports it
uninstallable. So:

* a **fault report** is a `project.task`;
* a **plan change** is a `crm.lead`;
* a **customer** is a `res.partner` with `customer_rank: 1`;
* an **invoice** is an `account.move` with `move_type: out_invoice`.

### Case status

`project.task.state` declares exactly six values, read with
`fields_get(['state'], ['selection'])`. A newly created task is `01_in_progress`; Odoo has **no**
`new` state, which is why the portal's vocabulary has none either.

| Odoo | Portal |
|---|---|
| `01_in_progress`, `02_changes_requested`, `03_approved` | `in_progress` |
| `04_waiting_normal` | `waiting` |
| `1_done` | `resolved` |
| `1_canceled` | `cancelled` |

An unrecognised code maps to `waiting`, which claims no progress that was not observed.

## SearchPort - Meilisearch

**Real.** `getmeili/meilisearch:v1.54`, index `plans`, primary key `id`.

The exported client class is **`Meilisearch`**, not `MeiliSearch`. The package renamed it, and the
old spelling is not exported at 0.62.0.

Index settings are applied by the adapter, not by a separate setup step:

| Setting | Value |
|---|---|
| `searchableAttributes` | `name`, `description`, `category` |
| `filterableAttributes` | `category`, `monthlyPriceMinor`, `downloadMbps` |
| `sortableAttributes` | `monthlyPriceMinor` |

An index without `filterableAttributes` does not fail - it returns unfiltered results. That is why
the contract tests were proved able to fail, by emptying the setting, before they were trusted to
pass.

Both write paths wait on the Meilisearch task rather than sleeping, because settings and documents
are applied asynchronously.

**Measured:** a plan query took **12.1 ms** on 2026-09-21, against a 200 ms target.

## PaymentGatewayPort - mock gateway

**SIMULATED.** It authorises nothing, settles nothing and touches no real money. Every response
body carries `"simulated": true`.

It is shaped as intent-and-confirm, like a real provider, so phase 2 replaces the adapter rather
than the checkout.

| Endpoint | Behaviour |
|---|---|
| `POST /v1/intents` | Takes `amountMinor` and `reference`. Rejects a non-integer or non-positive amount |
| `POST /v1/intents/:id/confirm` | Takes `instrument`. Returns a receipt, or HTTP 402 on a decline |
| `GET /v1/intents/:id` | Reads an intent |
| `GET /healthz` | Liveness |

| Test instrument | Outcome |
|---|---|
| `pm_test_ok` | `succeeded` |
| `pm_test_decline` | `declined`, reason `card_declined` |
| `pm_test_insufficient` | `declined`, reason `insufficient_funds` |

## DocumentOcrPort - the `ocr` service

**Real.** Tesseract behind a small HTTP wrapper, `POST /v1/read` on port 8090. The image travels
in the request body. No bind mount is used, because Docker Desktop refuses to mount the working
path on the development machine.

| Endpoint | Behaviour |
|---|---|
| `POST /v1/read` | Body is the raw image. Returns `rawText`, the four card fields, `confidence` and `wordCount` |
| `GET /healthz` | Liveness |

`confidence` is the mean Tesseract word confidence over detected words, divided by 100. The
`conf` and `text` columns are located by **parsing the TSV header row by name**. Reading them by
position is how a perfectly extracted card came to appear to score 64.7 rather than 93.3 during
this increment's review.

An unreadable document returns an `unreadable` error rather than guessed fields. A half-read
document number would be trusted by the decision rules, which is worse than returning nothing.

### The `docgen` service - FIXTURE ONLY

**Never deploy this.** It renders the specimen documents the tests use, on port 8092. It is a
separate service from `ocr` precisely so that it cannot be reached through the product service,
and it logs `FIXTURE ONLY` at start-up.

Four qualities, each tuned to occupy one band of the decision rules so every branch is reachable
by construction. Measured through the running services on 2026-09-22:

| Quality | Confidence | Fields read | Reaches |
|---|---|---|---|
| `clean` | 0.9327 | 4 of 4 | approved |
| `photo` | 0.9358 | 4 of 4 | approved |
| `smudged` | 0.5461 | 0 of 4 | referred |
| `illegible` | 0.0000 | none | declined |

Rendering is deterministic: the same inputs give byte-identical output. Every card carries
**SPECIMEN - NOT A REAL DOCUMENT**.

## IdentityDecisionPort - rules

**SIMULATED, permanently.** It consults no identity bureau, no sanctions list and no credit file.
It compares the typed identity against what was read and applies thresholds. Any real deployment
would replace it, which is the whole reason it sits behind a port.

It returns an outcome rather than a `Result`, because a decline is an answer and not a failure of
the port.

| Threshold | Value |
|---|---|
| Confidence below which nothing is trusted | 0.30, declines |
| Confidence below which nothing is acted on | 0.60, refers |
| Name similarity at or above which the names match | 0.85 |
| Name similarity below which they are different names | 0.60, declines |

**The order is deliberate.** A wrong document number declines at any confidence, because it is
conclusive. The confidence band is checked **before** any field comparison: comparing a claimed
name against a field the reader could not read would decline an applicant for the reader's
failure rather than their own.

## Email - Mailpit

**Real SMTP, captured locally.** Mailpit accepts the conversation on port 1025 and shows the
message at `http://localhost:8025`. Nothing leaves the machine.
