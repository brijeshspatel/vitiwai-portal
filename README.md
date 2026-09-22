# Vitiwai Utilities - customer self-service portal

Vitiwai Utilities is a **fictional** water and broadband provider in Fiji. This portal is a
demonstration project. Every customer, address, invoice, plan and payment in it is synthetic.

The portal moves five call-centre jobs online: opening an account, seeing what you owe, paying a
bill, comparing plans, and reporting a fault. Odoo stays the system of record; the portal never
becomes a second source of truth for anything Odoo already owns.

**Increments 1A, 1B and 1C are delivered, and the interface has been reviewed.** The container stack, the application shell, the
synthetic dataset, and the first customer workflow: opening an account with an identity document.
All five workflows work end to end: opening an account, seeing what you owe,
paying it, comparing plans and reporting a fault. The layout has a narrow state for
phones, and `axe-core` reports zero WCAG 2.2 AA violations on every route.
Increment 1E adds performance measurement, CSRF tokens and rate limiting.

## What is real, and what is simulated

Read this before drawing any conclusion from a demonstration.

| Capability | Real or simulated |
|---|---|
| ERP and CRM - customers, invoices, leads, support cases | **Real.** Odoo 19 Community, self-hosted |
| Plan search | **Real.** Meilisearch |
| Database | **Real.** PostgreSQL 16 |
| Transactional email | **Real SMTP, captured locally.** Mailpit accepts the conversation; nothing leaves the machine |
| Customer data | **Synthetic.** Generated, deterministic, and never anybody's real details |
| **Payment authorisation and settlement** | **Simulated.** A mock gateway. No real money, no real card, no real provider |
| Reading an identity document | **Real.** Tesseract, in the `ocr` service |
| **Identity verification decision** | **Simulated.** Rules over the extracted text. No bureau, no sanctions list, no credit file is consulted |
| **Specimen identity documents** | **Fixture.** The `docgen` service renders them. It must never be deployed |
| **Cloud hosting** | **Simulated in phase 1.** A local production build stands in for it |

## Requirements

* Node.js 22 or later. Built and verified on **v26.2.0**.
* Docker with Compose v2. Verified on **Docker 29.5.3, Compose v5.1.4**.
* About **5.1 GB** of disk for the container images. `odoo:19.0` alone is 3.29 GB.
* npm. `pnpm`, `yarn` and `bun` are not used.

## Getting it running

```bash
npm install
cp .env.example .env

npm run stack:up     # preflight, compose up, the Odoo database, then the portal migrations
npm run seed         # 12 plans, 200 customers, 600 invoices
npm run dev          # http://localhost:3000
```

### The port preflight is not optional

`npm run stack:up` runs `npm run preflight` first, and that check exists because of a real
failure. **A port with no listener can still be unbindable.** Windows reserves ranges, and a
reserved port reports as free to any check that looks for a listener; `docker compose up` then
fails with `An attempt was made to access a socket in a way forbidden by its access permissions`.

On the development machine, `55403-55502` is reserved, which is why the databases use **15432**
and **15433** rather than the 55432 and 55433 an earlier draft proposed. The preflight runs both
a listener check and a real bind attempt, and names which one failed.

To see the reserved ranges on Windows:

```
netsh interface ipv4 show excludedportrange protocol=tcp
```

### The first Odoo run takes about two minutes

It installs 64 modules. Measured at **118 s** on 2026-09-21. It is not stuck. `npm run init:odoo`
polls for readiness rather than sleeping, and is safe to re-run.

## Ports

| Service | Port | Web interface |
|---|---|---|
| Portal | 3000 | http://localhost:3000 |
| Odoo | 8069 | http://localhost:8069 (admin / admin) |
| Meilisearch | 7700 | http://localhost:7700 |
| Mailpit | 8025 | http://localhost:8025 |
| Mock gateway | 8091 | http://localhost:8091/healthz |
| OCR | 8090 | http://localhost:8090/healthz |
| Document generator (fixture) | 8092 | http://localhost:8092/healthz |
| Portal database | 15432 | - |
| Odoo database | 15433 | - |

All ten are configurable in `.env`.

## Signing in and paying a bill

The seed creates customers in Odoo; portal credentials are created by onboarding. To sign in as a
seeded customer without completing onboarding first:

```bash
npm run demo:credential
# adi.baleiwai.19@example.test / demo-passphrase
```

Then go to <http://localhost:3000/signin>.

**What you can do once signed in**

| Page | What it does |
|---|---|
| `/account` | Balance, current invoice, due date and usage history |
| `/account/pay` | Pay the outstanding bill with a test card |
| `/account/change-plan` | Ask to move to a different plan. Creates a lead in Odoo |
| `/account/support` | Report a fault and watch its status |
| `/plans` | Search and filter the catalogue. No sign-in needed |

**The test cards.** The gateway is simulated and understands exactly three:

| Card | Outcome |
|---|---|
| Test card that succeeds | Paid. The Odoo balance drops to zero and a receipt appears in Mailpit |
| Test card that is declined | Declined. Nothing is charged and the balance is unchanged |
| Test card with insufficient funds | Declined, with a different reason |

**Paying twice is impossible**, and it is worth trying: submit the payment form, go back and
submit it again. The second attempt returns the first receipt rather than charging you. Two
separate attempts on the same invoice are refused by the database itself.

**Watching an agent change a case.** Report a fault at `/account/support`, then open
<http://localhost:8069>, find the task in Project, and change its state. Reload the support page:
the new status is there. The portal is a view over Odoo, not a copy of it.

## Opening an account

Go to <http://localhost:3000/join>. You need a specimen document; the `docgen` service renders
one. **Never upload a real identity document.**

```bash
curl -s -X POST http://localhost:8092/v1/render \
  -H 'content-type: application/json' \
  -d '{"surname":"NAIQAMA","givenNames":"ANA MEREANI","dateOfBirth":"14 MAR 1991","documentNumber":"FJ7481239","quality":"clean"}' \
  -o specimen.png
```

Enter the name as `ANA MEREANI NAIQAMA`, the date of birth as 14 March 1991, and the document
number as `FJ7481239`, then upload `specimen.png`.

**Reaching the other two outcomes.** Extraction on a clean document is close to exact, so a
referral or a decline has to be constructed:

| To get | Do this |
|---|---|
| Approved | `clean` or `photo`, details matching the card |
| Referred | Render `smudged`, or type a clearly different name such as `ANA MEREANI DELANA` |
| Declined | Render `illegible`, or type a different document number |

**Your uploaded image is never stored.** It is read inside the request and discarded. What is kept
is the text that was read and the decision that followed; no table has a column that could hold an
image.

## What it costs to run

Nothing. Every service is open source and runs locally. No account, no card, no cloud.

Measured with `docker stats --no-stream` on 2026-09-21, all six services up:

| Service | Memory |
|---|---|
| Odoo | 76.8 MiB |
| Odoo database | 48.1 MiB |
| Meilisearch | 66.6 MiB |
| Portal database | 34.1 MiB |
| Mock gateway | 20.1 MiB |
| Mailpit | 7.8 MiB |
| OCR | about 25 MiB |
| Document generator | about 25 MiB |
| **Total** | **about 300 MiB** |

Against a 7.755 GiB Docker ceiling on the development machine.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Unit and component tests |
| `npm run test:contract` | Contract tests. **Needs the stack running and seeded.** Reads `.env` itself; no manual `source` step |
| `npm run preflight` | Port check: listener and bind |
| `npm run stack:up` / `stack:down` / `stack:reset` | Start, stop, or destroy with volumes |
| `npm run seed` | Load synthetic data. Idempotent |
| `npm run migrate` | Apply the portal database migrations. Idempotent |
| `npm run demo:credential` | Give a seeded customer a password, so you can sign in |
| `npm run portal:free` | Free port 3000 when a previous server is still holding it |

`npm test` deliberately excludes the contract tests. A suite that fails because Docker is down
teaches nothing about the change under test.

Every command reads `.env` for itself, falling back to `.env.example` per key. A value already set
in your shell wins over the file, so you can override one setting without editing anything
committed. There is no step where you have to export the variables by hand.

## How it is put together

The application depends on six **ports** - `ErpCustomerPort`, `CrmCasePort`, `PaymentGatewayPort`,
`SearchPort`, `DocumentOcrPort` and `IdentityDecisionPort`. Each has one **adapter**, and
`src/composition.ts` is the only module allowed to name one. ESLint enforces that.

This is what makes phase 2 a configuration change: replacing the simulated gateway with a real
provider touches `src/composition.ts` and nothing else.

See `docs/explanation/architecture/` for the architecture and `docs/reference/` for the integration contracts,
including the four Odoo call conventions that every adapter must honour.

## Troubleshooting

`docs/how-to/` holds the runbook. The three most common problems:

* **`docker compose up` fails on a port** - run `npm run preflight`; it names the port and says
  whether it was occupied or refused.
* **Odoo refuses the credentials** - the database is not initialised. Run `npm run init:odoo`.
* **The seed stops half way** - it is idempotent, so run it again. To start clean,
  `npm run stack:reset` then `npm run stack:up` and `npm run seed`.
