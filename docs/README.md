# Documentation

Placement and naming are governed by `config/markdown-governance.policy.json`.

| Folder | Holds |
|---|---|
| `docs/how-to/`, `docs/reference/`, `docs/explanation/` | living documents, edited in place with a SemVer bump |
| `docs/records/` | dated records — immutable once `status: active` |
| `docs/decisions/` | ADRs, `NNNN-title.md` |

Records are named `YYYY-MM-DD-<type>-<subject>-vX.Y.Z.md`; living documents are
named `<subject>-vX.Y.Z.md`. The filename version token must equal the `version`
in the frontmatter.
