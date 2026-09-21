# full-stack-ai-developer

## Documentation standards (installed by aia-template-002 - block 6780e7f)

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
or `Presented as: numbered list (reason)`. The `/aia:` commands carry this rule
at every site that asks; this paragraph is for a session that has not run one.

`python .claude/aia/conventions.py` and `python .claude/aia/diagrams.py` check
all of this, and the pre-commit hook runs both.
