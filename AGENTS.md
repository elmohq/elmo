# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Elmo is an open-source AI visibility tracking platform (Answer Engine Optimization). It is a **pnpm monorepo** using **Turborepo**, **Node.js 24**, and **PostgreSQL 16**.

Key apps: `apps/web` (TanStack Start dashboard, port 3000), `apps/worker` (pg-boss background jobs), `apps/www` (marketing site, port 3001), `apps/cli` (deployment CLI).

### Running services

- **PostgreSQL**: Start with `sudo pg_ctlcluster 16 main start`. Verify with `pg_isready`.
- **Web app dev server**: From repo root, run with env vars loaded (see below). Uses Vite on port 3000.
- **Worker**: Reads env from `apps/web/.env` via `--env-file`. Only needed for background job processing (AI evaluations, reports).

### Environment variables

The `.env` file must exist at **both** the repo root AND `apps/web/.env` (Vite reads from its project root; the worker reads from `apps/web/.env` via `--env-file`). Required minimum for local mode:

```
DATABASE_URL=postgres://elmo:elmo@localhost:5432/elmo
DEPLOYMENT_MODE=local
VITE_DEPLOYMENT_MODE=local
BETTER_AUTH_SECRET=<random-hex>
DEFAULT_ORG_ID=default
DEFAULT_ORG_NAME=Default Organization
APP_URL=http://localhost:3000
VITE_APP_URL=http://localhost:3000
DISABLE_TELEMETRY=1
```

For the env validation to pass fully, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATAFORSEO_LOGIN`, and `DATAFORSEO_PASSWORD` must also be set. Placeholder values work for UI testing.

### Database migrations

Run from `packages/lib`: `DATABASE_URL=... npx drizzle-kit migrate`

### Common commands

See `README.md` for the full commands reference. Key ones:

- `pnpm dev` — start all dev servers (turbo)
- `pnpm lint` — Biome linter (pre-existing CSS/Tailwind directive warnings are expected)
- `pnpm test` — Vitest unit tests
- `pnpm build` — build all packages
- `pnpm format` — format with Biome

### Gotchas

- **Node.js 24 required**: The repo enforces `engines.node: "24.x"`. Use `nvm use 24`.
- **Biome CSS lint warnings**: The linter reports Tailwind `@apply` directive warnings in CSS files — these are pre-existing and expected.
- **pnpm build warnings**: Some dependencies have ignored build scripts (sentry-cli, msw, protobufjs, vue-demi). This is configured via `pnpm.onlyBuiltDependencies` and `pnpm.ignoredBuiltDependencies` in root `package.json`.
- **E2E tests**: Require Playwright browsers (`pnpm exec playwright install`) and a running app instance. They are separate from unit tests.
- **Worker env loading**: The worker's `dev` script uses `--env-file=../web/.env`, so the env file must be in `apps/web/`.
