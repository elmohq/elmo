# @elmohq/cli

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
