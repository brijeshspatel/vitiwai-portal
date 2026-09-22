# Documentation

Each folder below holds one kind of document. Filenames are lower case with
hyphens, and a document stays in the folder that matches what it is.

| Folder | Holds |
|---|---|
| `docs/how-to/`, `docs/reference/`, `docs/explanation/` | living documents, edited in place with a SemVer bump |
| `docs/records/` | dated records — immutable once `status: active` |
| `docs/decisions/` | ADRs, `NNNN-title.md` |

Records are named `YYYY-MM-DD-<type>-<subject>-vX.Y.Z.md`; living documents are
named `<subject>-vX.Y.Z.md`. The filename version token must equal the `version`
in the frontmatter.
