# @workspace/docs

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
