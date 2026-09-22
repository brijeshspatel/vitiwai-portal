# full-stack-ai-developer

## Documentation standards

Applies to every human-readable artefact this workflow produces: records,
reports, specifications, reviews, changelog entries and code comments.

**Written using ASD-STE100 Simplified Technical English principles** -- never
described as *compliant* or *certified*. The dictionary is licensed and nothing
here has been formally assessed, so the claim would be about an assessment that
never happened.

**When two of these pull against each other, the earlier one wins:** Technical
Accuracy, Safety, Unambiguous Meaning, Completeness, Consistency, Simplicity,
Brevity. **Brevity is last, deliberately.** Recorded rationale, evidence and the
reasoning behind a decision are never removed to satisfy concision.

**One idea per sentence. Active voice, with the actor named.** *The checker
refuses the commit*, not *the commit is refused* -- in a record of what happened,
who acted is the information.

**One name per thing, and the official one where it exists.** A synonym
introduced for variety reads as a second thing.

**No filler and no promotion.** *Comprehensive*, *seamless*, *robust*,
*powerful*, *cutting-edge* describe how the author feels rather than what the
thing does. A measurement replaces them, or nothing does.

**Claims carry their evidence.** A number appears with the command that produced
it and the date it was taken; without either it outlives the truth of it.

**Before drafting:** read the code rather than the documentation about it; run
what can be run; record what could not be verified and say so -- *could not
check* is a finding, never recorded as verified; cite living documents by stable
path, because a versioned citation freezes that document at that version for
ever.

**Before accepting generated documentation**, check it for Accuracy, Evidence,
Terminology, Clarity, Concision, Consistency and Actionability, then ask: what
would a reader still have to ask, what in here is unverified, and what would this
cost if it were wrong.

Applies to every human-readable artefact this workflow produces: records,
reports, specifications, reviews, changelog entries and code comments.

**UK English.** `behaviour`, `initialise`, `summarise`, `analyse`, `centre`.
Words that are correct in both dialects are left alone -- `program` is right for
a computer program, `license` is right as a verb.

**Professional tone.** State what is true and what was measured. Prefer the
plain word. Do not celebrate, and do not hedge a fact that was checked.

**Status vocabulary -- exactly four, and only as a status marker.**

| Symbol | Means |
|---|---|
| PASS | pass, success, complete |
| FAIL | failure, blocked |
| WARN | warning, attention required |
| INFO | information |

Never decorative, and never in code, commit subjects or frontmatter. The literal
symbols are declared in the template's `agent.yaml`.

**Diagrams.** Mermaid where the subject is a graph -- architecture, workflow,
state, gates, lifecycles. An aligned table where it is not. Every diagram must
reflect implemented behaviour, not intended behaviour.

**Citations.** A record must never cite a living document by its versioned
filename: records are immutable and living documents are renamed on every bump,
so the citation freezes that document at that version for ever. Cite the folder
index instead.

**Approvals and decisions are selectable questions.** When the workflow needs a
human decision it presents one clear question with selectable actions, the
recommended action first, through the harness's structured question tool where
it offers one, and otherwise as a numbered list of the same actions answered by
number or first word. The human selects; the workflow executes the selection and
never asks the human to type an approval sentence or a command name where the
tool exists. Every approval record states `Presented as: selectable question`
or `Presented as: numbered list (reason)`. This paragraph is for a session that
has not yet been told the rule elsewhere.

`python .claude/aia/conventions.py` and `python .claude/aia/diagrams.py` check
all of this, and the pre-commit hook runs both.

## Vitiwai portal - rules a fresh session would get wrong

Added 2026-09-21 by run `20260921-001-greenfield-sample-project`. Each line is a
rule, not history; the evidence is in that run's completion report.

**Check a port by binding it, never by looking for a listener.** A port the
operating system reserves has no listener, so a listener check reports it free
and `docker compose up` then fails opaquely. Run `npm run preflight`, which does
both checks. `55403-55502` is reserved on the development machine, so **55432 and
55433 must not be used** - the databases are on 15432 and 15433.

**Ask both address families, or the answer is worthless.** `next start` binds the
IPv6 wildcard `::`, which is a dual-stack socket: it serves `127.0.0.1` and
`[::1]`, while `0.0.0.0` stays bindable. A probe that binds `0.0.0.0` alone
therefore calls an occupied port free. Use `scripts/lib/port.mjs` - never write a
fresh probe. Measured 2026-09-22: `npm run portal:free` printed
`PASS - port 3000 is already free` while `curl localhost:3000` returned 200.

**Do not hard-code `powershell.exe`.** Windows PowerShell 5.1 is absent from PATH
on the development machine and only `pwsh.exe` resolves, so `execFileSync` throws
`ENOENT`. Try both, and never swallow the failure - the stale-server bug above
survived because a `catch` discarded that `ENOENT` and the caller reported
success anyway.

**Only `src/composition.ts` may import from `src/adapters/`.** Everything else
depends on a port. ESLint fails the run otherwise. This is what keeps phase 2 a
configuration change.

**Odoo Community has no `helpdesk` module and no `new` task state.** A fault
report is a `project.task`, a plan change is a `crm.lead`, and `project.task`
starts at `01_in_progress`. The four JSON-RPC call conventions every adapter must
honour are in `docs/reference/`.

**Money is an integer count of minor units.** Floating-point currency is a defect,
not a style choice. Convert at the Odoo boundary with `fromOdooFloat`.

**Verify a package's export shape before importing it.** This increment had two
wrong guesses: `eslint-config-next` exports an array rather than a factory, and
the Meilisearch class is `Meilisearch`, not `MeiliSearch`.

**Forcing a `details` open needs two rules, not one.** Older engines hide its
contents with `display` on the children; Chrome 131 and later wrap them in
`::details-content` with `content-visibility: hidden`, which a `display`
override cannot reach. With only the first rule the navigation vanished from
the header while remaining in the DOM with four links and a 271px box, and
every automated test still passed. Found by looking at a screenshot.

**jsdom has no layout engine, and that quietly limits three checks.** Element
heights are all zero, so "every row is the same height" is satisfied by three
zeros. `axe-core` returns `color-contrast` as *incomplete* and never runs
`target-size` at all - the rule is absent from the result rather than reported
as skipped. Assert these against the stylesheet or the tokens instead, and never
read "zero violations" as covering them.

**jsdom does not complete React's Suspense swap.** A streamed route sends slow
content into `<div hidden id="S:0">` at the end of `body`, and a browser moves
it. Nothing moves it in jsdom, so `/plans` appears to have no `h1` inside `main`.
`tests/contract/portal.ts` does the move; it must match `P:` as well as `B:`,
because postponed content uses the second prefix.

**`textContent` concatenates across elements.** `<dt>Due</dt><dd>22 September
2026</dd>` reads as `Due22 September 2026`, which defeats any word-boundary
assertion. Walk text nodes and join them with a space.

**Never probe a page mid-hydration.** A dashboard read during its ~200ms
Suspense window reports `Loading...` and zero-height rows, which looks exactly
like a stuck page and a broken layout. Two separate "defects" found this way
were withdrawn after measuring; the page settles correctly.

**Anything middleware imports must be safe on the Edge runtime.** Importing a
module that reaches `node:crypto` builds cleanly and then fails every request
with `Native module not found: node:crypto`. The CSRF cookie and header names
live in `src/security/csrf-names.ts`, which imports nothing, for that reason.

**A page and a route handler cannot share a path in the App Router.** A form
that posts to its own page gets 404 for the POST while the GET still renders, so
the page looks fine and the workflow is dead. Every form posts to a `/submit`
sibling. `POST /join` was a 404 for five increments because no test submitted a
form - they all called the function beneath it.

**A bodyless POST to a page returns 200; the same POST with a body returns 404.**
Any probe asking "does this endpoint exist" must carry a body, or it passes on
exactly the defect it was written to catch.

**Every mutation carries a CSRF token, and every handler verifies it before
acting.** `rejectIfForged(form)` is the guard. A new mutating route without it is
a hole, and no test will notice, because a route nobody wrote a test for is a
route nobody tested.

**The test suite is not a customer.** It signs in as one seeded account far more
often than a person would, which a per-email rate limit correctly refuses. The
harness clears the buckets it filled itself; the limit is never relaxed and
nothing in `src/` can bypass it.

**Label every simulated capability in three places** - on screen, in the README,
and in a comment on the adapter.
