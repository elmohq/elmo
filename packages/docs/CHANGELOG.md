# @workspace/docs

## 0.2.9

### Patch Changes

- @workspace/ui@0.2.9

## 0.2.8

### Patch Changes

- @workspace/ui@0.2.8

## 0.2.7

### Patch Changes

- @workspace/ui@0.2.7

## 0.2.6

### Patch Changes

- @workspace/ui@0.2.6

## 0.2.5

### Patch Changes

- 76e2a5f: Add telemetry opt-out prompt during `elmo init` and new `elmo telemetry status|enable|disable` subcommand. See [Telemetry](https://elmohq.com/docs/developer-guide/telemetry) for what's collected.
- edf97d4: Add Mistral as a direct API provider. Set `MISTRAL_API_KEY` and target via `mistral:mistral-api:<model>[:online]`.
- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.
- Updated dependencies [7cba46d]
  - @workspace/ui@0.2.5

## 0.2.4

### Patch Changes

- @workspace/ui@0.2.4

## 0.2.3

### Patch Changes

- @workspace/ui@0.2.3

## 0.2.2

### Patch Changes

- 06fb190: Worker dispatch now reads `SCRAPE_TARGETS` end-to-end via the provider registry. Deployments that configure non-default providers no longer hit `AI_LoadAPIKeyError` for providers they never set up, the worker fails fast at startup on misconfigured `SCRAPE_TARGETS`, and `brand.enabledModels` filters per brand.
  - @workspace/ui@0.2.2

## 0.2.1

### Patch Changes

- adf7642: CLI `elmo init` now walks through each provider one at a time.
  - @workspace/ui@0.2.1

## 0.2.0

### Patch Changes

- @workspace/ui@0.2.0
