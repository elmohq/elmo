# @workspace/web

## 0.2.4

### Patch Changes

- 67a0389: Fix local-mode registration end-to-end and lock down the auth surface. The first `/auth/register` submission in local mode now atomically creates the default org + admin membership, so register → brand onboarding works in one pass; any subsequent signup is rejected. Demo mode narrows writable `/api/auth/**` endpoints to a whitelist of just sign-in and sign-out. Drops the unused `DEFAULT_ORG_ID` and `DEFAULT_ORG_NAME` env vars.
- d0b2925: Redesign the Visibility and Citations filter bar (model / tags / lookback dropdowns + search), wire model filters to `brand.enabledModels`, and move the visibility-bar rollup into a single SQL query — cuts load time from ~10s to under 1s on large brands. Also fixes the "unbranded" tag filter and a search clear-X flicker.
- Updated dependencies [67a0389]
  - @workspace/lib@0.2.4
  - @workspace/config@0.2.4
  - @workspace/whitelabel@0.2.4
  - @workspace/deployment@0.2.4
  - @workspace/og@0.2.4
  - @workspace/api-spec@0.2.4
  - @workspace/ui@0.2.4

## 0.2.3

### Patch Changes

- b635a99: Make default brand cadence configurable via `DEFAULT_DELAY_HOURS` env var. `brand.delayOverrideHours` still takes precedence. The default changed from the hard-coded 72h to 24h.
- a62ef89: Restyle the demo login and add a preview to Storybook.
- e9be023: Ensure icons/favicons are comprehensive for non-whitelabel deployments.
- f3604e2: Replace the page-top demo-mode banner with a compact "Demo" pill next to the sidebar logo (with a tooltip explaining the read-only behavior), and move version / elmohq.com / GitHub links into the sidebar footer for every deployment mode except whitelabel. Also reads the better-auth `user.image` field so avatars actually render.
  - @workspace/api-spec@0.2.3
  - @workspace/config@0.2.3
  - @workspace/deployment@0.2.3
  - @workspace/lib@0.2.3
  - @workspace/og@0.2.3
  - @workspace/ui@0.2.3
  - @workspace/whitelabel@0.2.3

## 0.2.2

### Patch Changes

- 63a6c22: Demo mode: visitors can now actually sign in — better-auth endpoints are exempt from the read-only write-block, and the login form pre-fills the seeded demo credentials.
- d3839b1: Demo deployments (`READ_ONLY=true`) now enable `supportsMultiOrg`, so the `/app` brand switcher renders when the demo user is seeded into multiple organizations. Pure local deployments continue to auto-redirect to the default org.
- 0ae9fc1: Fix missing stylesheet and favicon in Docker builds caused by `@tailwindcss/vite` emitting different CSS hashes in the client and SSR passes.
- 06fb190: Worker dispatch now reads `SCRAPE_TARGETS` end-to-end via the provider registry. Deployments that configure non-default providers no longer hit `AI_LoadAPIKeyError` for providers they never set up, the worker fails fast at startup on misconfigured `SCRAPE_TARGETS`, and `brand.enabledModels` filters per brand.
- Updated dependencies [63a6c22]
- Updated dependencies [06fb190]
  - @workspace/lib@0.2.2
  - @workspace/whitelabel@0.2.2
  - @workspace/deployment@0.2.2
  - @workspace/api-spec@0.2.2
  - @workspace/config@0.2.2
  - @workspace/og@0.2.2
  - @workspace/ui@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [adf7642]
  - @workspace/lib@0.2.1
  - @workspace/whitelabel@0.2.1
  - @workspace/deployment@0.2.1
  - @workspace/api-spec@0.2.1
  - @workspace/config@0.2.1
  - @workspace/og@0.2.1
  - @workspace/ui@0.2.1

## 0.2.0

### Minor Changes

- 95b71db: Replace visibility % with Share of Voice metric across reports, add reports API, and redesign report for print

### Patch Changes

- 4ce1911: show opportunities where prompts have competitor but not brand citations
- 7acf16a: Keep the brand sidebar visible when navigating to a non-existent route under `/app/:brand/*`.
- 1dcaf44: Chart PNG exports now include deployment branding and use a cleaner fixed-size layout
- 37e9e16: Prompt Details now shows when the prompt is scheduled to run next.
- Updated dependencies [95b71db]
  - @workspace/lib@0.2.0
  - @workspace/api-spec@0.2.0
  - @workspace/whitelabel@0.2.0
  - @workspace/deployment@0.2.0
  - @workspace/config@0.2.0
  - @workspace/og@0.2.0
  - @workspace/ui@0.2.0

## 0.1.2

### Patch Changes

- optimize prompt page loading and render with proper virtualization
  - @workspace/config@0.1.2
  - @workspace/demo@0.1.2
  - @workspace/deployment@0.1.2
  - @workspace/lib@0.1.2
  - @workspace/local@0.1.2
  - @workspace/ui@0.1.2
  - @workspace/whitelabel@0.1.2

## 0.1.1

### Patch Changes

- Added changesets to track versions.
- Updated dependencies
  - @workspace/whitelabel@0.1.1
  - @workspace/config@0.1.1
  - @workspace/local@0.1.1
  - @workspace/demo@0.1.1
  - @workspace/ui@0.1.1
