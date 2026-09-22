# Documentation

Three folders, each holding one kind of document.

| Folder | Holds |
|---|---|
| `docs/how-to/` | Task-oriented instructions. The runbook lives here. |
| `docs/reference/` | Facts to look up: the integration contracts each port must honour. |
| `docs/explanation/` | Why the system is shaped the way it is. The architecture lives here. |

Filenames are lower case with hyphens and say what the document is. They carry
no version: these documents describe the system as it stands, so the only
version that means anything about them is the product's, and that is in
`VERSION`.

Documents are edited in place. There is no separate archive: what a document
said before a revision is in the git history, which is a better record than a
second copy that can drift - and `git log --follow` reaches back through the
renames.
