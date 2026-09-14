# @workspace/web

## 0.3.0

### Minor Changes

- 78593b9: Adds support for [Elmo Cloud](https://app.elmohq.com/).

### Patch Changes

- cf0caf0: Moved the admin links into the account menu so the sidebar only shows nav for where you are; admin routes keep them on the sidebar.
- 1f32756: Fixed citation position calculation bug for Claude.
- da87272: Rebuilt the interface on Base UI, so menus, dialogs, tooltips and form controls behave more consistently across keyboard and assistive tech.
- 3ba2e5a: Added a "book a demo" call to action to the sign-in and sign-up pages and to the get-started section of the site.
- 1f32756: Prevent the citations page from showing citations from disabled prompts.
- 8ed9ef3: The sign-up page now closes as soon as a self-hosted instance has its first account, instead of staying reachable until the server restarts.
- d8a37e5: The account menu offers a single Switch Brand link instead of listing every organization once you belong to more than three.
- 1f32756: Track up to 500 competitors per brand.
- 1f32756: AI citations are now de-duplicated by URL for a specific answer, so pages cited more than once count only one time.
- 78593b9: Choose which AI platforms a brand tracks directly from the LLMs settings page.
- f4f7ef2: Improve visibility chart accessibility for colorblind users. Your brand's lines are emphasized and you can click on an entry in the legend to isolate a competitor's line in the graph.
- 78593b9: The account menu lists every organization (not just brands) you belong to.
- f87d2e2: Dashboard URLs now include the organization and the brand — `/app/org/{organization}/brand/{brand}`.
- f87d2e2: An organization's brands, team, and plan each have their own settings page, and its name and URL can be changed there.
- 3ba2e5a: The password reset pages now match the sign-in and sign-up layout.
- 58ff775: Keep a brand's prompts editable when it already holds more than the prompt limit.
- 1f46b62: Fix broken docs link in `elmo init` and the LLMs settings page.
- 3358b9f: Fix a crash in the onboarding wizard and competitor/prompt editors on deployments served over plain HTTP, where `crypto.randomUUID` is unavailable.
- 1c4d39c: Support "GitHub Flavored Markdown" on prompt detail pages. LLM responses now render tables, strikethroughs, and URL autolinks more correctly.
- 41545b6: Authentication and organization entry pages now show descriptive, deployment-aware browser tab titles.
- 3ba2e5a: The sign-in and sign-up pages now explain what Elmo does, which engines it tracks, and who already uses it — with self-hosted instances also shown what the managed cloud offers.
- 78593b9: Self-hosted deployments now show each tracked platform's estimated cost on the LLMs settings page, plus which providers to configure for the platforms they aren't tracking yet.
- c596f61: Show brand and competitor icons across the dashboard.
- Updated dependencies [1f32756]
- Updated dependencies [d4e5db4]
- Updated dependencies [da87272]
- Updated dependencies [3ba2e5a]
- Updated dependencies [9633ca2]
- Updated dependencies [78593b9]
- Updated dependencies [1f32756]
- Updated dependencies [1f32756]
- Updated dependencies [78593b9]
- Updated dependencies [f4f7ef2]
- Updated dependencies [78593b9]
- Updated dependencies [f87d2e2]
- Updated dependencies [f87d2e2]
- Updated dependencies [58ff775]
- Updated dependencies [1f46b62]
- Updated dependencies [1c4d39c]
- Updated dependencies [78593b9]
- Updated dependencies [78593b9]
- Updated dependencies [78593b9]
  - @workspace/lib@0.3.0
  - @workspace/whitelabel@0.3.0
  - @workspace/ui@0.3.0
  - @workspace/config@0.3.0
  - @workspace/cloud@0.3.0
  - @workspace/deployment@0.3.0
  - @workspace/og@0.3.0
  - @workspace/api-spec@0.3.0

## 0.2.19

### Patch Changes

- eaa54ce: Fixed the logo briefly rendering in a fallback font before swapping on the first page load.
- Updated dependencies [dac89d4]
  - @workspace/lib@0.2.19
  - @workspace/cloud@0.2.19
  - @workspace/whitelabel@0.2.19
  - @workspace/deployment@0.2.19
  - @workspace/api-spec@0.2.19
  - @workspace/config@0.2.19
  - @workspace/og@0.2.19
  - @workspace/ui@0.2.19

## 0.2.18

### Patch Changes

- d0187ed: Prompts can now be added in bulk by pasting one per line.
- d9faaec: Brand analysis can now be pointed at a full page URL to research a sub-brand, while mentions stay tracked against the site's domain.
- 6cd51af: The prompts page now keeps a save bar in view that flags unsaved changes, highlights the rows you edited, and warns before you navigate away or close the tab.
- 69b2b77: Sort prompts alphabetically on the prompt settings page.
- Updated dependencies [d0187ed]
- Updated dependencies [bfa6282]
- Updated dependencies [9394d65]
- Updated dependencies [d9faaec]
- Updated dependencies [72e7091]
  - @workspace/lib@0.2.18
  - @workspace/cloud@0.2.18
  - @workspace/whitelabel@0.2.18
  - @workspace/deployment@0.2.18
  - @workspace/api-spec@0.2.18
  - @workspace/config@0.2.18
  - @workspace/og@0.2.18
  - @workspace/ui@0.2.18

## 0.2.17

### Patch Changes

- edcb19d: Competitor domains can now be added by pasting a full URL.
- 5a0a40c: You can now use the keyboard to select tags for filtering.
- 9b1a20b: Show when an opportunities report was last evaluated.
- ab640a1: DeepSeek and Moonshot/Kimi models render with their own logos instead of generic icons.
- Updated dependencies [5a0a40c]
  - @workspace/ui@0.2.17
  - @workspace/whitelabel@0.2.17
  - @workspace/deployment@0.2.17
  - @workspace/api-spec@0.2.17
  - @workspace/cloud@0.2.17
  - @workspace/config@0.2.17
  - @workspace/lib@0.2.17
  - @workspace/og@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies [91de584]
  - @workspace/lib@0.2.16
  - @workspace/whitelabel@0.2.16
  - @workspace/deployment@0.2.16
  - @workspace/api-spec@0.2.16
  - @workspace/config@0.2.16
  - @workspace/og@0.2.16
  - @workspace/ui@0.2.16

## 0.2.15

### Patch Changes

- 43d23a3: Ensure the overview charts use the same timezone-specific x-axis.
  - @workspace/api-spec@0.2.15
  - @workspace/config@0.2.15
  - @workspace/deployment@0.2.15
  - @workspace/lib@0.2.15
  - @workspace/og@0.2.15
  - @workspace/ui@0.2.15
  - @workspace/whitelabel@0.2.15

## 0.2.14

### Patch Changes

- bb674b9: Onboarding brand analysis now runs in the background and is more resilient to failures, avoiding timeouts on slow analyses.
  - @workspace/api-spec@0.2.14
  - @workspace/config@0.2.14
  - @workspace/deployment@0.2.14
  - @workspace/lib@0.2.14
  - @workspace/og@0.2.14
  - @workspace/ui@0.2.14
  - @workspace/whitelabel@0.2.14

## 0.2.13

### Patch Changes

- 4272c19: Added new citation source categories and a Google AI Mode breakdown to the citations dashboard.
- 222fd4f: Local-mode deployments now support multiple brands. The brand switcher shows a "Create new brand" option that provisions a new org + admin membership for the user.
- 3f17708: Added the Google Shopping breakdown to a prompt's Citations tab on the prompt details page.
- 532d592: Added a sort control to the Visibility page.
- cf5a7da: Added a Query Fan-Out section showing the searches AI engines run for your prompts, with a prompt-to-query diff, the words engines add or drop, and the searches you're missing.
- c4505ba: Breaking: `/api/v1` DELETE endpoints now return the deleted resource directly instead of a `{ message, data }` wrapper (the deleted prompt includes a `deletedRunsCount` field), PATCH endpoints reject an empty body with a 400, an unparseable `website` on `/tools/analyze` is now a 400 instead of a 500, and 500 responses no longer echo internal error messages.
- Updated dependencies [c4505ba]
  - @workspace/api-spec@0.2.13
  - @workspace/config@0.2.13
  - @workspace/deployment@0.2.13
  - @workspace/lib@0.2.13
  - @workspace/og@0.2.13
  - @workspace/ui@0.2.13
  - @workspace/whitelabel@0.2.13

## 0.2.12

### Patch Changes

- @workspace/api-spec@0.2.12
- @workspace/config@0.2.12
- @workspace/deployment@0.2.12
- @workspace/lib@0.2.12
- @workspace/og@0.2.12
- @workspace/ui@0.2.12
- @workspace/whitelabel@0.2.12

## 0.2.11

### Patch Changes

- 4ccba7a: Add "Share of Voice" and "Opportunities" pages.
- 4ccba7a: Fix "current visibility" to show the latest point of the carried-forward trend (the value the line ends on) instead of the whole-window average, so the headline number matches the chart beside it.
- 4ccba7a: Fix the sidebar showing only "Overview" after the onboarding wizard finishes in local mode, until the page is refreshed.
- 4ccba7a: Fix the visibility page failing to load for brands with many active prompts.
  - @workspace/api-spec@0.2.11
  - @workspace/config@0.2.11
  - @workspace/deployment@0.2.11
  - @workspace/lib@0.2.11
  - @workspace/og@0.2.11
  - @workspace/ui@0.2.11
  - @workspace/whitelabel@0.2.11

## 0.2.10

### Patch Changes

- b716c43: Fix the dashboard briefly showing "No Data Yet" with "none are currently enabled" right after the onboarding wizard finishes in local mode.
- 2d8fd8c: Bulk-select prompts in the editor (settings and onboarding) to enable or disable many at once.
- Updated dependencies [520aef4]
  - @workspace/lib@0.2.10
  - @workspace/whitelabel@0.2.10
  - @workspace/deployment@0.2.10
  - @workspace/api-spec@0.2.10
  - @workspace/config@0.2.10
  - @workspace/og@0.2.10
  - @workspace/ui@0.2.10

## 0.2.9

### Patch Changes

- 2173aa8: Accept bare domains (e.g. `example.com`) in the brand website field and normalize the stored value to the origin (`https://example.com/products` is saved as `https://example.com/`).
- 1ee1955: Show the signup screen instead of login on a fresh local deployment.
  - @workspace/api-spec@0.2.9
  - @workspace/config@0.2.9
  - @workspace/deployment@0.2.9
  - @workspace/lib@0.2.9
  - @workspace/og@0.2.9
  - @workspace/ui@0.2.9
  - @workspace/whitelabel@0.2.9

## 0.2.8

### Patch Changes

- @workspace/api-spec@0.2.8
- @workspace/config@0.2.8
- @workspace/deployment@0.2.8
- @workspace/lib@0.2.8
- @workspace/og@0.2.8
- @workspace/ui@0.2.8
- @workspace/whitelabel@0.2.8

## 0.2.7

### Patch Changes

- 1e770ff: Publish multi-arch (`linux/amd64` + `linux/arm64`) Docker images for `elmohq/elmo-web` and `elmohq/elmo-worker`, so Apple Silicon and other arm64 hosts can pull them.
- 6ab2b42: Fix OG image generation: `og:image` is now an absolute URL and renders the current page's title/description. Adds `og:url`, `og:site_name`, `og:locale`, and `og:logo` to the document head.
  - @workspace/api-spec@0.2.7
  - @workspace/config@0.2.7
  - @workspace/deployment@0.2.7
  - @workspace/lib@0.2.7
  - @workspace/og@0.2.7
  - @workspace/ui@0.2.7
  - @workspace/whitelabel@0.2.7

## 0.2.6

### Patch Changes

- 1a1005a: Admin `/api/v1/brands` endpoints (POST, GET, PATCH) now accept and return a single `domains` list instead of `website` + `additionalDomains`. This future-proofs against a future db model change.
- Updated dependencies [1a1005a]
  - @workspace/api-spec@0.2.6
  - @workspace/config@0.2.6
  - @workspace/deployment@0.2.6
  - @workspace/lib@0.2.6
  - @workspace/og@0.2.6
  - @workspace/ui@0.2.6
  - @workspace/whitelabel@0.2.6

## 0.2.5

### Patch Changes

- edf97d4: Add Mistral as a direct API provider. Set `MISTRAL_API_KEY` and target via `mistral:mistral-api:<model>[:online]`.
- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.
- 839b98b: REST-style brand management API: `GET/POST /api/v1/brands`, `GET/PATCH /api/v1/brands/{brandId}`, `POST /api/v1/tools/analyze`, and full CRUD for `/api/v1/competitors`. API-created brands skip onboarding — callers hit `tools/analyze` first if they want suggestions, then create brands with whatever they choose to keep.
- 839b98b: Brand onboarding is now a single screen: paste a website and review the suggested products, competitors (with their own domains and aliases), additional brand domains, aliases, and tagged starter prompts before saving. Powered by whichever direct LLM API you've configured (OpenRouter, Anthropic, OpenAI, or Mistral) with web search.
- Updated dependencies [7990382]
- Updated dependencies [edf97d4]
- Updated dependencies [7cba46d]
- Updated dependencies [839b98b]
  - @workspace/lib@0.2.5
  - @workspace/config@0.2.5
  - @workspace/api-spec@0.2.5
  - @workspace/deployment@0.2.5
  - @workspace/og@0.2.5
  - @workspace/ui@0.2.5
  - @workspace/whitelabel@0.2.5

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
