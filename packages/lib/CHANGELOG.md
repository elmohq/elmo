# @workspace/lib

## 0.2.2

### Patch Changes

- 63a6c22: Demo mode: visitors can now actually sign in — better-auth endpoints are exempt from the read-only write-block, and the login form pre-fills the seeded demo credentials.
- 06fb190: Worker dispatch now reads `SCRAPE_TARGETS` end-to-end via the provider registry. Deployments that configure non-default providers no longer hit `AI_LoadAPIKeyError` for providers they never set up, the worker fails fast at startup on misconfigured `SCRAPE_TARGETS`, and `brand.enabledModels` filters per brand.

## 0.2.1

### Patch Changes

- adf7642: CLI `elmo init` now walks through each provider one at a time.

## 0.2.0

### Minor Changes

- 95b71db: Replace visibility % with Share of Voice metric across reports, add reports API, and redesign report for print

## 0.1.2
