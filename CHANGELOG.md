# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`VERSION` is the authoritative version source. It and this file move
together -- never one alone.

## [Unreleased]

## [0.3.0] - 2026-09-22

Increment 1B: opening an account with an identity document. Workflow W1, and
the identity-document images deliverable 3 specified but increment 1A never
built.

### Added

- `ocr` service: Tesseract behind a small HTTP wrapper, reading an image posted
  to it and returning the card fields with a confidence figure.
- `docgen` service: renders specimen identity documents at four qualities. It
  is a **fixture** and is a separate service from `ocr` so that it cannot be
  reached through the product service.
- `HttpOcrAdapter` and `RulesIdentityAdapter`, implementing the two ports
  declared but left unimplemented in increment 1A.
- The portal database's first schema: `portal_user` and
  `onboarding_application`, with an idempotent migration runner.
- Password hashing with scrypt from `node:crypto`, per-user salt, constant-time
  comparison.
- Upload validation checking the declared type against the magic bytes.
- The `/join` form and the three outcome screens.

### Changed

- `standards.validation` is unchanged; `npm run migrate` joins `stack:up`.
- `DeclineReason` gains `name_mismatch`. The parent specification's rule table
  defined referral for a name similarity between 0.60 and 0.85 and said nothing
  below 0.60, which left a real case with no outcome.

### Security

- No uploaded image is written to disk, stored or logged. A contract test
  asserts no `bytea` column exists on `onboarding_application`.
- Every query in `src/db` is parameterised; there is no template literal in the
  directory.
- No plaintext password reaches a log, a column or Odoo.
- Rate limiting on the onboarding route is **deferred to increment 1E** and
  named here rather than omitted silently.

### Known limitations

- The identity decision is **simulated** and is labelled as such on every
  outcome screen, in this file, in the README and in the adapter.
- A referred applicant is told a general reason, not which field failed.
- The sign-in screen arrives in increment 1C; this increment creates the
  credential only.

## [0.2.0] - 2026-09-21

Increment 1A of the Vitiwai Utilities self-service portal: the local container
stack, the application shell and the synthetic dataset.

### Added

- Local container stack under Docker Compose: Odoo 19 Community with its own
  PostgreSQL, a PostgreSQL for the portal, Meilisearch, Mailpit and a simulated
  payment gateway. Measured at 253 MiB total with `docker stats` on 2026-09-21.
- Port preflight running two checks per port, a listener check and a real bind
  attempt. A reserved port has no listener, so a listener check alone reports it
  free and the stack then fails to start.
- Next.js 16 application shell with React 19 and TypeScript in strict mode:
  layout, navigation, design tokens with dark mode, skip link, and error,
  loading and not-found states.
- Six port interfaces with adapters for Odoo customers, Odoo cases and
  Meilisearch. `src/composition.ts` is the only module permitted to name an
  adapter, enforced by ESLint.
- Deterministic synthetic data generator and an idempotent seed: 12 plans,
  200 customers and 600 invoices.
- Continuous integration running lint, typecheck, unit tests, build and a
  dependency audit, plus contract tests against a live stack.
- Documentation: README, architecture, integration contracts and a runbook.

### Changed

- `standards.validation` now declares `npm run lint`, `npm run typecheck` and
  `npm test`, so the workflow has a validation baseline to run.
- `.gitignore` covers Node and Next.js build output and local environment files.

### Security

- Security headers set at the edge: `X-Content-Type-Options`, `X-Frame-Options`
  and `Referrer-Policy`. `X-Powered-By` removed.
- Environment parsed and validated once by Zod; `process.env` is read in exactly
  one module.
- `npm audit` reports 0 vulnerabilities across 425 packages.
- All data is synthetic. Every generated email address uses the reserved
  `.test` top-level domain, asserted by test.

### Known limitations

- Payment authorisation and the identity-verification decision are **simulated**
  and are labelled as such on screen, in the README and in code.
- Cloud hosting is deferred: phase 2 (Azure) and phase 3 (AWS) both wait on a
  confirmed account.
- The five customer workflows arrive in increments 1B to 1E.

## [0.1.0] - 2026-09-21

### Added

- Greenfield repository baseline provisioned by `provision.py`.
- AIA command layer and tooling installed at project scope under `.claude/`.
- Markdown governance adopted, verified by the repository's own checker.
- `VERSION` declared as the authoritative version source, paired with this
  changelog, per ADR 0005 D-7. Without both files the workflow's release step is
  a dead branch and the repository would never receive versioning at all.
- `main` and `dev` protected, and the workflow root created.
