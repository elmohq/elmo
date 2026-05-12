# @elmohq/cli

## 0.2.10

### Patch Changes

- 1f9c1cd: Default the CLI config directory to `~/.elmo`.
- ac355fd: Prompt for the web app port in `elmo init` (defaults to 1515).
- afbd561: Recommended `elmo init` setup no longer adds direct-API query targets — only scraping tracks ChatGPT and Google AI Mode.
- 19eacbc: Add `elmo edit`, drop `elmo telemetry` and the `~/.elmo/config.json` file. `elmo edit env|compose` opens the file in `$VISUAL` / `$EDITOR` (fallback `nano`) — toggle `DISABLE_TELEMETRY` there instead of via the removed `elmo telemetry` subcommand. Telemetry state and the deployment ID now live entirely in `.env`; `elmo init` stamps the CLI version and timestamp into the `.env` and `elmo.yaml` headers, and re-running it preserves the existing `DEPLOYMENT_ID`.
- 063e33e: Remove `elmo start`, `elmo stop`, `elmo logs`, and `elmo build` aliases — use `elmo compose <args>` directly (e.g. `elmo compose up -d`, `elmo compose down`, `elmo compose logs -f`, `elmo compose build`).

## 0.2.9

### Patch Changes

- 3d378c2: Clean up wording in `elmo init`.

## 0.2.8

### Patch Changes

- c576cee: Publish `elmohq/elmo-db-migrate` images instead of always attempting to build as part of the CLI.

## 0.2.7

### Patch Changes

- 1e770ff: Standardize Docker image naming between the CLI and release process on `elmohq/elmo-web` and `elmohq/elmo-worker`.

## 0.2.6

## 0.2.5

### Patch Changes

- 839b98b: `elmo init` adds a recommended setup path — pick a scraper (BrightData or Olostep), pick a direct LLM API (OpenRouter, Anthropic, OpenAI, or Mistral), four prompts total. The custom path now requires at least one direct LLM API so onboarding analysis works out of the box.
- 76e2a5f: Add telemetry opt-out prompt during `elmo init` and new `elmo telemetry status|enable|disable` subcommand. See [Telemetry](https://elmohq.com/docs/developer-guide/telemetry) for what's collected.
- edf97d4: Add Mistral as a direct API provider. Set `MISTRAL_API_KEY` and target via `mistral:mistral-api:<model>[:online]`.
- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.

## 0.2.4

### Patch Changes

- 67a0389: Fix local-mode registration end-to-end and lock down the auth surface. The first `/auth/register` submission in local mode now atomically creates the default org + admin membership, so register → brand onboarding works in one pass; any subsequent signup is rejected. Demo mode narrows writable `/api/auth/**` endpoints to a whitelist of just sign-in and sign-out. Drops the unused `DEFAULT_ORG_ID` and `DEFAULT_ORG_NAME` env vars.

## 0.2.3

## 0.2.2

### Patch Changes

- fa45737: CLI: mask the external `DATABASE_URL` prompt and note that it must be an IPv4-compatible direct connection or pooler.

## 0.2.1

### Patch Changes

- adf7642: CLI `elmo init` now walks through each provider one at a time.

## 0.2.0

## 0.1.2

## 0.1.1

### Patch Changes

- Added changesets to track versions.
