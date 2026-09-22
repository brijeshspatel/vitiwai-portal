# Documentation

Three folders, each holding one kind of document.

| Folder | Holds |
|---|---|
| `docs/how-to/` | Task-oriented instructions. The runbook lives here. |
| `docs/reference/` | Facts to look up: the integration contracts each port must honour. |
| `docs/explanation/` | Why the system is shaped the way it is. The architecture lives here. |

Filenames are lower case with hyphens and carry the document's own version -
`<subject>-vX.Y.Z.md`. That version is the document's, not the product's; it
moves when the document is materially revised, and the changelog entry for a
release says which documents moved with it.

Documents are edited in place. There is no separate archive: what a document
said before a revision is in the git history, which is a better record than a
second copy that can drift.
