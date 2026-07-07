# AGENTS.md

## What this is

Elmo is an open-source AI visibility platform (Answer Engine Optimization): it tracks how AI answer engines like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews mention, cite, and describe brands. It is a **pnpm + Turborepo monorepo** on **Node.js 24** (enforced via `engines`), **TypeScript**, and **PostgreSQL**.

- `apps/web` — product dashboard (TanStack Start + Vite, port 3000)
- `apps/worker` — pg-boss background jobs (AI evaluations, citation tracking, reports)
- `apps/www` — marketing site, docs, and blog (port 3001)
- `apps/cli` — `@elmohq/cli`, the Docker Compose deployment CLI
- `packages/lib` — shared logic and the Drizzle schema/migrations
- `packages/ui` — shared shadcn-based UI components
- `packages/docs` — user-facing docs content (MDX), rendered by `apps/www`
- `packages/deployment` — deployment-mode config (reads `DEPLOYMENT_MODE`, exposes per-mode features)
- `packages/config` — env validation and shared constants/types
- `packages/api-spec` — OpenAPI spec
- `e2e/` — Playwright end-to-end tests

Full setup instructions are in the developer guide at `packages/docs/content/docs/developer-guide/`.

## Commands

- `pnpm dev` — all dev servers (turbo)
- `pnpm test` — Vitest unit tests
- `pnpm build` — build all packages
- `pnpm format` — Biome format
- Migrations: from `packages/lib`, `pnpm exec drizzle-kit migrate` (NEVER RUN THESE UNLESS EXPLICITLY INSTRUCTED BY THE USER)
- E2E tests need Playwright browsers (`pnpm exec playwright install`) and a running app; they are separate from unit tests
- shadcn components: always install with the CLI (`pnpm dlx shadcn@latest add <component>`, from `packages/ui` or `apps/www` — each has its own `components.json`) — never hand-create them

Run `pnpm format` before committing, and `check-types` for the packages you touched before opening the PR. Skip `pnpm lint` — CI doesn't gate on it. Only run tests mid-work when they help you iterate (`pnpm --filter <pkg> test` to scope them).

## Package management and supply-chain security

- **Always use pnpm.** Never install or run dependencies with npm, yarn, or `npx` — that sidesteps the workspace's protections.
- This repo enforces [pnpm supply-chain security](https://pnpm.io/supply-chain-security) via `pnpm-workspace.yaml`: `minimumReleaseAge` (a multi-day cooldown on new releases), `trustPolicy: no-downgrade`, `blockExoticSubdeps`, and an `allowBuilds` allowlist for install scripts.
- **Never weaken or bypass these controls**: don't add `minimumReleaseAgeExclude` entries, don't flip packages to `true` in `allowBuilds`, don't suppress `pnpm audit` advisories, and don't remove `overrides` (many are scoped security patches or dedup anchors). If an install fails because of these controls, that is the system working — report it instead of working around it.

## Environment

`.env` must exist at **both** the repo root and `apps/web/.env` (Vite reads its project root; the worker reads `apps/web/.env` via `--env-file`). Minimum for local mode: `DATABASE_URL`, `DEPLOYMENT_MODE=local`, `VITE_DEPLOYMENT_MODE=local`, `BETTER_AUTH_SECRET`, `APP_URL`/`VITE_APP_URL`, `DISABLE_TELEMETRY=1`. Env validation also requires `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATAFORSEO_LOGIN`, and `DATAFORSEO_PASSWORD` — placeholder values work for UI-only work.

## Git workflow

- Work happens in PRs against `main`.
- Commit as you go: small, atomic commits that show real progress. Don't rewrite history (amend, rebase, force-push) to make it look tidy afterward.
- Commit subjects are plain imperative sentences — no conventional-commit prefixes. Write `paginate top cited domains`, not `feat(web): paginate top cited domains`.
- Don't bump package versions; releases go through Changesets.

## Comments and docs

- Comment only to explain **why** or to add context the code can't show. Never restate what the code already says.
- The same applies to docs and this file: never write down what's already derivable from the repo (what a file imports, what a script runs, how code is structured).
- Don't describe prior behavior ("previously this did X") and don't reference GitHub issues or tickets in code — that context belongs in the commit message or PR.

## Changesets

- Add one only for **user-facing** changes (something an end user of the product would notice). Internal refactors, dependency bumps, and CI tweaks don't get one.
- Keep it to one short, product-focused sentence; default to `patch`; scope it to the packages actually affected.
- If a non-package directory (like `e2e/`) breaks Changesets tooling, fix the tooling configuration rather than inventing versions.

## Pull requests

- Don't commit image artifacts (screenshots, videos, Playwright reports) or one-off screenshot scripts — attach proof to the PR description instead.
- Don't add "screenshot-only" tests whose sole purpose is producing PR images; new tests must make assertions that are valuable long-term.
