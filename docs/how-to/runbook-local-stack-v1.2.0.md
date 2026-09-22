---
doc_id: runbook-local-stack
title: "Runbook - the local stack"
type: runbook
version: 1.2.0
status: active
created: 2026-09-21
updated: 2026-09-21
supersedes: null
superseded_by: null
change_summary: "Adds the stale-server and payment-reconciliation failures seen while building increment 1C."
---

# Runbook - the local stack

Every failure below was seen while building increment 1A. This is not a list of things that could
go wrong; it is a list of things that did.

## `docker compose up` fails to bind a port

```
Error response from daemon: ports are not available: exposing port TCP 0.0.0.0:55433
-> 127.0.0.1:0: listen tcp 0.0.0.0:55433: bind: An attempt was made to access a socket
in a way forbidden by its access permissions.
```

**Cause.** The operating system reserves the port. It has no listener, so every check that looks
for one reports it free.

**Fix.**

```bash
npm run preflight
```

It names the port and says whether another process `OCCUPIED` it or the system `REFUSED` it. For a
refusal, list the reserved ranges:

```
netsh interface ipv4 show excludedportrange protocol=tcp
```

Choose a port outside every listed range, set it in `.env`, and run the preflight again. On the
development machine `55403-55502` is reserved, which is why the databases use 15432 and 15433.

## Odoo seems to hang on first start

**It is not hanging.** The first run installs 64 modules, and that took 118 s when measured on
2026-09-21. The health check allows 180 s before it reports the service unhealthy.

Watch it:

```bash
docker compose logs -f odoo
```

## Odoo refuses the credentials

```
Odoo refused the credentials for database "vitiwai". Has `npm run seed` initialised it?
```

**Cause.** The container runs, but nobody created the database.

**Fix.** Run `npm run init:odoo`. It is idempotent and exits 0 when the database already exists.

## The seed stops part way

The seed is idempotent: it matches each customer by email before creating one, so running it again
continues rather than duplicating.

To start from nothing:

```bash
npm run stack:reset   # this removes the volumes as well
npm run stack:up
npm run seed
```

## Contract tests fail with "not reachable"

`npm run test:contract` needs the stack. `npm test` excludes it deliberately, so Docker being down
does not affect an ordinary test run.

```bash
npm run stack:up && npm run seed && npm run test:contract
```

## The plans page shows "Plans are unavailable"

Meilisearch is down, or its index is empty.

```bash
curl http://localhost:7700/health     # expect {"status":"available"}
npm run seed                          # re-indexes the 12 plans
```

## OCR returns no words on a document you expect it to read

Check which quality was rendered. `illegible` is *designed* to be unreadable and `smudged` is
designed to lose every field. Both exist so the declined and referred paths can be reached.

A `clean` render should return confidence near 0.93 with all four fields. When it does not, the
`ocr` container is the thing to look at rather than the renderer.

## A migration failed part way

It cannot. Each migration runs in its own transaction and is rolled back on failure, so the
database is never left half-migrated. Fix the SQL and run `npm run migrate` again.

When the run cannot connect at all, the portal database is not up:

```bash
docker compose ps portal-db
npm run migrate
```

## The portal is serving an old build

The symptom is confusing rather than obvious: a new route returns 404, or a filter appears not to
work, while the build output clearly lists it. A previous `next start` is still holding port 3000
and serving the previous build.

`pkill -f "next start"` does not reliably reach the Node process behind it on Windows.

```bash
npm run portal:free    # frees the port, whatever is holding it
```

Then start the server and **check a route that only exists in the new build** before trusting any
verification. This cost two debugging detours during increment 1C, both of which looked like real
defects.

## A payment succeeded at the gateway but not in Odoo

The payment row is written before Odoo is told, so the money is never invisible. Find it:

```bash
docker compose exec -T portal-db psql -U portal -d portal \
  -c "SELECT id, invoice_id, amount_minor, receipt_id, created_at
        FROM payment WHERE status = 'succeeded' ORDER BY created_at DESC LIMIT 10;"
```

Then check whether Odoo agrees, by looking at `amount_residual` on that invoice. Where the row
exists and Odoo still shows the amount owing, the ERP call failed after the payment was taken and
the invoice needs reconciling by hand. The customer was told the payment succeeded, because it
did.

## Reclaiming disk

The images take about 4.7 GB, and `odoo:19.0` is 3.29 GB of that.

```bash
npm run stack:reset
docker image rm odoo:19.0 getmeili/meilisearch:v1.54 axllent/mailpit:v1.31
docker image rm vitiwai-ocr vitiwai-docgen
```
