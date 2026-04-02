# Agent guidelines
This repo uses automated agents. Follow these rules when making changes.

## Pull requests
- **Do not commit image artifacts** (screenshots, videos, Playwright reports) to the repo. If you need proof in a PR description, generate artifacts locally and embed them in the PR description without committing them.
- **Do not add “screenshot-only” tests** whose sole purpose is to generate PR images. Prefer existing tests; if you must add coverage, add a real assertion-based test that remains valuable long-term.
- **Do not bump versions** (or add placeholder versions) unless the change explicitly requires a release/versioning action.

## Changesets
- When adding a Changeset, keep it **scoped to the packages actually affected**.
- If a non-package directory (like `e2e/`) breaks Changesets tooling, fix the tooling configuration rather than inventing versions.

