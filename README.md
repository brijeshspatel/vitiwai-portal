# Vitiwai Utilities - customer self-service portal

Vitiwai Utilities is a **fictional** water and broadband provider in Fiji. This portal is a
demonstration project. Every customer, address, invoice, plan and payment in it is synthetic.

The portal moves five call-centre jobs online: opening an account, seeing what you owe, paying a
bill, comparing plans, and reporting a fault. Odoo stays the system of record; the portal never
becomes a second source of truth for anything Odoo already owns.

**Increments 1A, 1B and 1C are delivered, and the interface has been reviewed.** The container stack, the application shell, the
synthetic dataset, and the first customer workflow: opening an account with an identity document.
All five workflows work end to end in a browser, each covered by a test that drives
it over HTTP rather than calling the function beneath it: opening an account, seeing what you owe,
paying it, comparing plans and reporting a fault. The layout has a narrow state for
phones, and `axe-core` reports zero WCAG 2.2 AA violations on every route.
Increment 1E's security half is delivered: CSRF tokens on every mutation, a
Content-Security-Policy with no `unsafe-inline`, validation at every handler,
rate limits and an audit trail. Performance and end-to-end measurement follow.

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
| `npm run test:browser` | Accessibility, performance and end-to-end journeys in a real browser. **Needs the stack, and the application built and started** |
| `npm run preflight` | Port check: listener and bind |
| `npm run stack:up` / `stack:down` / `stack:reset` | Start, stop, or destroy with volumes |
| `npm run seed` | Load synthetic data. Idempotent |
| `npm run migrate` | Apply the portal database migrations. Idempotent |
| `npm run demo:credential` | Give a seeded customer a password, so you can sign in |
| `npm run portal:free` | Free port 3000 when a previous server is still holding it |

`npm test` deliberately excludes the contract and browser tests. A suite that fails because Docker
is down teaches nothing about the change under test.

### The browser tests, and why they exist separately

`npm run test:browser` needs `npm run build && npm start` first, and a Chromium binary that
Playwright supplies.

They are not a duplicate of the contract tests. jsdom has no layout engine, so three of the
things an accessibility claim is usually about - colour contrast, target size and element height -
cannot be computed there. `axe-core` returns `color-contrast` as *incomplete* and never runs
`target-size` at all. The browser project answers those by painting the page.

It covers three things:

| What | How it is decided |
|---|---|
| Accessibility | `axe-core` against the rendered page; every journey driven by `Tab` and `Enter` with no mouse; every page checked at 320px for sideways scroll |
| Performance | LCP <= 2.5s, CLS <= 0.1, TBT <= 200ms from `PerformanceObserver`; first-load JavaScript <= 200 KiB transferred, from Resource Timing |
| Journeys | Each customer journey submitted through its own form, never by calling the code beneath it |

Every measurement is appended to `measurements.jsonl` at the repository root, which is ignored by
git. It is written because a budget that passes at 41 KiB and one that passes at 199 KiB are the
same green tick and very different facts.

**The payment journey consumes what it needs.** Paying the outstanding bill leaves nothing to pay,
and `npm run seed` is idempotent so it issues no replacement. The test asserts both states and
records which one it met; to exercise the submission again, point it at a customer who still owes
something:

```
DEMO_EMAIL=<their email> npm run demo:credential
DEMO_EMAIL=<their email> npm run test:browser
```

Every command reads `.env` for itself, falling back to `.env.example` per key. A value already set
in your shell wins over the file, so you can override one setting without editing anything
committed. There is no step where you have to export the variables by hand.

## How it is put together

The application depends on six **ports** - `ErpCustomerPort`, `CrmCasePort`, `PaymentGatewayPort`,
`SearchPort`, `DocumentOcrPort` and `IdentityDecisionPort`. Each has one **adapter**, and
`src/composition.ts` is the only module allowed to name one. ESLint enforces that.

This is what makes phase 2 a configuration change: replacing the simulated gateway with a real
provider touches `src/composition.ts` and nothing else.

See [the architecture](docs/explanation/architecture/architecture.md) for how the pieces fit, and
[the integration contracts](docs/reference/integration-contracts.md) for what each port must honour,
including the four Odoo call conventions every adapter has to get right.

## Running it as a public demonstration

`DEMO_MODE=true` builds a portal that reaches nothing outside itself. It is what
the `Dockerfile` builds, and it exists because the full stack is eight
containers - Odoo among them - which needs paid hosting to put on the internet.

| | Default | `DEMO_MODE=true` |
|---|---|---|
| Customers, invoices, usage | Odoo | Generated in process, from `src/seed/generate.ts` |
| Support cases and plan changes | Odoo | The portal's own database |
| Plan search | Meilisearch | The generated catalogue, filtered in process |
| Payments | The mock gateway container | The same decision, in process |
| Identity documents | Uploaded and read by the OCR service | **Not accepted at all** |
| Services needed | Eight containers | The portal and one Postgres |

**The demonstration accepts no identity documents.** The form renders no upload
field and the handler reads no file. Anyone can reach a public address, and a
form asking for a passport will eventually be sent a real one; the only reliable
way not to hold a document is never to read one. Applications are decided from
the details typed into the form, and the identity rules still run against them.

Every page carries a banner saying what the build is, and the sign-in page
publishes the demonstration account. That credential guards nothing: everyone
sees the same generated customer, and a password on synthetic data would only
stop people seeing what they came to look at.

```
docker build -t vitiwai-portal:demo .
docker run -p 3000:3000 \
  -e DEMO_MODE=true \
  -e PORTAL_DATABASE_URL="$DATABASE_URL" \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  vitiwai-portal:demo
```

The container migrates the database and creates the demonstration account before
it serves. If either fails it does not start, which is better than failing one
visitor at a time.

## Troubleshooting

**[`screenshots/`](screenshots/) shows every area of the portal**, at
1440x900 and at 390x844, captured from the running application. Regenerate them
with `npm run screenshots` while a portal is running.

[The runbook](docs/how-to/runbook-local-stack.md) covers the failures seen while building this.
The three most common:

* **`docker compose up` fails on a port** - run `npm run preflight`; it names the port and says
  whether it was occupied or refused.
* **Odoo refuses the credentials** - the database is not initialised. Run `npm run init:odoo`.
* **The seed stops half way** - it is idempotent, so run it again. To start clean,
  `npm run stack:reset` then `npm run stack:up` and `npm run seed`.

## Licence

MIT. See [`LICENSE`](LICENSE).

`package.json` keeps `"private": true`, which is not a contradiction: it is npm's
guard against publishing this application to the registry by accident, and says
nothing about the terms under which the source is offered.

The data is another matter, and there is none to license. Every customer,
address, invoice and plan here is generated; no real person's information is in
this repository or its history.

