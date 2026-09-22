# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`VERSION` is the authoritative version source. It, this file, `package.json`
and `package-lock.json` move together -- never one alone. `tests/unit/version.test.ts`
enforces it, because they drifted for two releases while nobody was checking
all four.

## [Unreleased]

## [0.5.0] - 2026-09-22

Interface review. Every area of the portal was inspected against the running
build and eleven defects were fixed, the layout gained a narrow state, and
accessibility is now measured rather than asserted.

### Fixed

- **A dead link sat in the primary navigation on every page.** `Support`
  pointed at `/support`, which returns 404 and has never existed. It was
  added when the application shell was built and survived three increments
  and four merges. A second entry one position earlier pointed at the real
  `/account/support`, so the word appeared twice and one of them was broken.
- **The navigation ignored the session.** A signed-in customer was offered
  "Sign in" and could only sign out from a sentence on the dashboard.
- **Form controls were unstyled everywhere except the plans filter.** The
  account-opening form rendered as 21px-tall Arial-on-grey browser defaults
  beside a themed 46px button. They are now 44px and 16px, which clears the
  WCAG 2.2 target size and stops iOS Safari zooming the page on focus.
- **Content links used the browser's colours** and turned visited-purple on
  the dark theme, because nothing styled `a` outside the navigation.
- **The usage table's peak row was half again as tall as the others.** The
  bar was a percentage of the cell it shared with its own figure, so the
  largest month - always 100% - wrapped its label to a second line. Every
  customer has a largest month.
- **Customers were shown storage formats**: `2026-09-22` as a due date and
  `2026-07` as a usage month.
- **The home page described the build, not the service**, under the heading
  "Increment 1A", and told the customer which increments the remaining
  workflows would arrive in - untrue since 0.4.0.
- The dashboard printed the amount owed twice; page-header cards rendered
  587px wide beside 1068px siblings.

### Added

- A 720px breakpoint, the stylesheet's first. Below it the navigation
  collapses into a keyboard-operable `details` disclosure with no
  JavaScript, grids stack to one column, and the usage bar's track is
  dropped in favour of the figures.
- `axe-core` across all eight routes at WCAG 2.2 A and AA, signed in and
  signed out: zero violations.
- Colour contrast computed from the design tokens in both themes, and
  control sizes asserted against the stylesheet - because `axe-core` in
  jsdom returns `color-contrast` as incomplete and never runs `target-size`
  at all.
- `src/domain/dates.ts`, so dates are formatted in one place.

### Known limitations

- Accessibility is measured in jsdom, which has no layout engine. Colour
  contrast and target size are therefore checked separately and
  deterministically rather than by axe. Nothing here replaces testing with
  an actual screen reader.
- CSRF tokens and rate limiting remain deferred to increment 1E.

### Fixed

- **`npm run portal:free` did not free the port, and said it had.** It bound
  `0.0.0.0` to decide whether the port was in use, while `next start` binds the
  IPv6 wildcard `::` -- a dual-stack socket that serves `127.0.0.1` too and
  leaves `0.0.0.0` bindable. The script printed
  `PASS - port 3000 is already free` while the server answered 200. This is the
  stale-server trap the script was written to prevent.
- **The same script could never stop anything on this machine.** It invoked
  `powershell.exe`, which is absent from PATH here, and discarded the resulting
  `ENOENT` in an empty `catch`. It now tries `pwsh.exe` first, names each process
  it stops, and fails loudly when no PowerShell is found. The false pass above
  was hiding this second defect entirely.
- Both port checks now live in `scripts/lib/port.mjs` and ask both address
  families, so `npm run preflight` and `npm run portal:free` answer the same
  question the same way.
- `package.json` and `package-lock.json` said 0.2.0 while `VERSION` and this
  file said 0.4.0, having been missed at the 0.3.0 and 0.4.0 releases.

## [0.4.0] - 2026-09-22

Increment 1C: signing in, the account dashboard, paying a bill, plan search
and support requests. All five customer workflows now work end to end.

### Added

- Server-side sessions with an opaque cookie, sign-in and sign-out, and a
  `requireSession` guard that every account route calls.
- The account dashboard: balance, current invoice, due date and usage
  history, with usage rendered as a table rather than a picture.
- Bill payment through the simulated gateway, with the payment registered in
  Odoo, a receipt by email, and two independent guards against paying twice.
- `MockGatewayAdapter`, the first implementation of `PaymentGatewayPort`.
- Plan search with category and price filters, as a GET form so a filtered
  view has its own address.
- Plan-change requests as Odoo leads and fault reports as Odoo tasks, with
  status changes made by an agent visible in the portal.
- Migration 002: `portal_session` and `payment`.
- `npm run demo:credential` and `npm run portal:free`.

### Changed

- **The seed now posts its invoices.** Increment 1A left all 620 in draft,
  which meant every balance read zero and the usage history was empty. The
  seed refuses to finish while any draft remains.
- **`recordPayment` registers a real payment** through
  `account.payment.register` rather than posting a comment. It previously
  moved no money, so "a successful payment reduces the balance" was
  unreachable.
- `DeclineReason` and the identity rules are unchanged; `CaseStatus` is now
  displayed in the customer's language rather than Odoo's codes.

### Security

- Sessions are revocable: signing out deletes the row, so the session dies
  everywhere rather than only in the browser that asked.
- One sign-in failure message for an unknown email and a wrong password, and
  the hash is verified either way so the timing does not distinguish them.
- Every account read is scoped by the session's own partner; no route takes a
  customer identifier from the request.
- `nodemailer` upgraded from 7 to 10 after `npm audit` reported a high
  severity SMTP command injection advisory. Re-audited to zero, and the
  receipt was re-verified rather than assumed.

### Known limitations

- Payment authorisation is **simulated** and labelled as such on the
  checkout and on the receipt.
- Sessions expire after 12 hours with no sliding renewal. That figure is an
  assumption, not a considered security posture.
- Rate limiting on sign-in and payment is deferred to increment 1E.
- Password reset, email verification and account closure do not exist.

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
