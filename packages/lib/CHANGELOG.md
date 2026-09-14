# @workspace/lib

## 0.3.0

### Minor Changes

- 78593b9: Adds support for [Elmo Cloud](https://app.elmohq.com/).

### Patch Changes

- 1f32756: Fixed citation position calculation bug for Claude.
- d4e5db4: Whitelabel sign-in no longer creates organizations from Auth0 `app_metadata`; it only grants membership in organizations that already exist, which are provisioned through the admin brands API.
- 9633ca2: Truncates excessively long citation titles when stored in the database.
- 1f32756: Track up to 500 competitors per brand.
- 1f32756: AI citations are now de-duplicated by URL for a specific answer, so pages cited more than once count only one time.
- 78593b9: Choose which AI platforms a brand tracks directly from the LLMs settings page.
- 78593b9: The account menu lists every organization (not just brands) you belong to.
- f87d2e2: Dashboard URLs now include the organization and the brand — `/app/org/{organization}/brand/{brand}`.
- 58ff775: Keep a brand's prompts editable when it already holds more than the prompt limit.
- 1f46b62: Fix broken docs link in `elmo init` and the LLMs settings page.
- 1c4d39c: Support "GitHub Flavored Markdown" on prompt detail pages. LLM responses now render tables, strikethroughs, and URL autolinks more correctly.
- 78593b9: Self-hosted deployments can set `RUNS_PER_PROMPT` to change how many times each run samples a platform, trading sampling confidence against provider spend.
- 78593b9: Self-hosted deployments now show each tracked platform's estimated cost on the LLMs settings page, plus which providers to configure for the platforms they aren't tracking yet.
- 78593b9: Recovering from a provider failure now re-runs only the models that missed their sample instead of re-sampling every model.
- Updated dependencies [3ba2e5a]
- Updated dependencies [78593b9]
- Updated dependencies [f4f7ef2]
- Updated dependencies [78593b9]
- Updated dependencies [f87d2e2]
- Updated dependencies [1f46b62]
- Updated dependencies [78593b9]
  - @workspace/config@0.3.0

## 0.2.19

### Patch Changes

- dac89d4: Waiting out a busy scraping provider's queue no longer abandons requests it has already charged for, and a prompt whose runs all fail now backs off instead of being retried immediately.
  - @workspace/config@0.2.19

## 0.2.18

### Patch Changes

- d0187ed: Prompts can now be added in bulk by pasting one per line.
- bfa6282: BREAKING CHANGE: DataForSEO now scrapes the real ChatGPT and Gemini interfaces instead of calling their model APIs, with no change needed to existing `SCRAPE_TARGETS`. This is more expensive (about $0.004 instead of $0.0006 to run). This could also impact visibility/citations as it switches to better reflect what users see in the actual chat website. If you would prefer to keep the old behavior, you will need to update your `SCRAPE_TARGETS` to pin the specific version of the model (`chatgpt:dataforseo:gpt-5.5:online` or `gemini:dataforseo:gemini-2.5-flash:online`) to keep using the LLM Responses API instead of the LLM Scraper API.
- 9394d65: Fix Oxylabs Perplexity query fan-out which incorrectly included follow-up questions.
- d9faaec: Brand analysis can now be pointed at a full page URL to research a sub-brand, while mentions stay tracked against the site's domain.
- 72e7091: Cap per-request spend on the direct API providers: output tokens on Anthropic, OpenAI, OpenRouter, and Mistral, plus web-search budget (Anthropic `max_uses`, OpenAI `maxToolCalls`), so no single tracked run can spend unboundedly.
  - @workspace/config@0.2.18

## 0.2.17

### Patch Changes

- @workspace/config@0.2.17

## 0.2.16

### Patch Changes

- 91de584: IMPORTANT BUGFIX: Fixed OpenAI response retrieval that broke in v0.2.15, which caused repeated (but billable) failures. If you are collecting data from the direct OpenAI API using Elmo, please update immediately.
  - @workspace/config@0.2.16

## 0.2.15

### Patch Changes

- @workspace/config@0.2.15

## 0.2.14

### Patch Changes

- @workspace/config@0.2.14

## 0.2.13

### Patch Changes

- @workspace/config@0.2.13

## 0.2.12

## 0.2.11

## 0.2.10

### Patch Changes

- 520aef4: Log start/done (with duration and result counts) for `analyzeBrand`, so the onboarding analyze step is visible in the web server logs.

## 0.2.9

## 0.2.8

## 0.2.7

## 0.2.6

## 0.2.5

### Patch Changes

- 7990382: BrightData: prefer `answer_text_markdown` over `answer_text` when extracting response text, so prompt responses render with markdown formatting in the UI.
- edf97d4: Add Mistral as a direct API provider. Set `MISTRAL_API_KEY` and target via `mistral:mistral-api:<model>[:online]`.
- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.
- 839b98b: Brand onboarding is now a single screen: paste a website and review the suggested products, competitors (with their own domains and aliases), additional brand domains, aliases, and tagged starter prompts before saving. Powered by whichever direct LLM API you've configured (OpenRouter, Anthropic, OpenAI, or Mistral) with web search.

## 0.2.4

### Patch Changes

- 67a0389: Fix local-mode registration end-to-end and lock down the auth surface. The first `/auth/register` submission in local mode now atomically creates the default org + admin membership, so register → brand onboarding works in one pass; any subsequent signup is rejected. Demo mode narrows writable `/api/auth/**` endpoints to a whitelist of just sign-in and sign-out. Drops the unused `DEFAULT_ORG_ID` and `DEFAULT_ORG_NAME` env vars.

## 0.2.3

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
