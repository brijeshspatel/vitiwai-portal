# Vitiwai Utilities - customer self-service portal

Vitiwai Utilities is a **fictional** water and broadband provider in Fiji. This portal is a
demonstration project. Every customer, address, invoice, plan and payment in it is synthetic.

The portal moves five call-centre jobs online: opening an account, seeing what you owe, paying a
bill, comparing plans, and reporting a fault. Odoo stays the system of record; the portal never
becomes a second source of truth for anything Odoo already owns.

**Increment 1A is delivered.** That is the container stack, the application shell and the
synthetic dataset. The five workflows arrive in increments 1B to 1E.

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
| **Identity verification decision** | **Simulated.** Rules over extracted text. No bureau is consulted. Arrives in 1B |
| **Cloud hosting** | **Simulated in phase 1.** A local production build stands in for it |

## Requirements

* Node.js 22 or later. Built and verified on **v26.2.0**.
* Docker with Compose v2. Verified on **Docker 29.5.3, Compose v5.1.4**.
* About **4.7 GB** of disk for the container images. `odoo:19.0` alone is 3.29 GB.
* npm. `pnpm`, `yarn` and `bun` are not used.

## Getting it running

```bash
npm install
cp .env.example .env

npm run stack:up     # port preflight, then docker compose up, then the Odoo database
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
| Portal database | 15432 | - |
| Odoo database | 15433 | - |

All eight are configurable in `.env`.

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
| **Total** | **253 MiB** |

Against a 7.755 GiB Docker ceiling on the development machine.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Unit and component tests |
| `npm run test:contract` | Contract tests. **Needs the stack running** |
| `npm run preflight` | Port check: listener and bind |
| `npm run stack:up` / `stack:down` / `stack:reset` | Start, stop, or destroy with volumes |
| `npm run seed` | Load synthetic data. Idempotent |

`npm test` deliberately excludes the contract tests. A suite that fails because Docker is down
teaches nothing about the change under test.

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
