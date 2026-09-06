# @workspace/config

## 0.3.0

### Minor Changes

- 78593b9: Adds support for [Elmo Cloud](https://app.elmohq.com/).

### Patch Changes

- 3ba2e5a: Added a "book a demo" call to action to the sign-in and sign-up pages and to the get-started section of the site.
- f4f7ef2: Improve visibility chart accessibility for colorblind users. Your brand's lines are emphasized and you can click on an entry in the legend to isolate a competitor's line in the graph.
- 78593b9: The account menu lists every organization (not just brands) you belong to.
- f87d2e2: An organization's brands, team, and plan each have their own settings page, and its name and URL can be changed there.
- 1f46b62: Fix broken docs link in `elmo init` and the LLMs settings page.
- 78593b9: Self-hosted deployments now show each tracked platform's estimated cost on the LLMs settings page, plus which providers to configure for the platforms they aren't tracking yet.

## 0.2.19

## 0.2.18

## 0.2.17

## 0.2.16

## 0.2.15

## 0.2.14

## 0.2.13

## 0.2.12

## 0.2.11

## 0.2.10

## 0.2.9

## 0.2.8

## 0.2.7

## 0.2.6

## 0.2.5

### Patch Changes

- edf97d4: Add Mistral as a direct API provider. Set `MISTRAL_API_KEY` and target via `mistral:mistral-api:<model>[:online]`.
- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.

## 0.2.4

### Patch Changes

- 67a0389: Fix local-mode registration end-to-end and lock down the auth surface. The first `/auth/register` submission in local mode now atomically creates the default org + admin membership, so register → brand onboarding works in one pass; any subsequent signup is rejected. Demo mode narrows writable `/api/auth/**` endpoints to a whitelist of just sign-in and sign-out. Drops the unused `DEFAULT_ORG_ID` and `DEFAULT_ORG_NAME` env vars.

## 0.2.3

## 0.2.2

## 0.2.1

## 0.2.0

## 0.1.2

## 0.1.1

### Patch Changes

- Added changesets to track versions.
