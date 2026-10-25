# @workspace/worker

## 0.7.5

### Patch Changes

- c3884e8: Call Jev through OpenRouter when no TypeSafe key is set: `elmo init` asks which to use, and can reuse your OpenRouter key.
- @workspace/config@0.7.5
  - @workspace/deployment@0.7.5
  - @workspace/lib@0.7.5

## 0.7.4

### Patch Changes

- db38a42: The web and worker images now ship with Node.js 24.22.1, which includes the [October 2026 Node.js security fixes](https://nodejs.org/en/blog/vulnerability), so self-hosted installs should update.
- @workspace/config@0.7.4
  - @workspace/deployment@0.7.4
  - @workspace/lib@0.7.4

## 0.7.3

### Patch Changes

- Updated dependencies [cacc8f9]
  - @workspace/lib@0.7.3
  - @workspace/deployment@0.7.3
  - @workspace/config@0.7.3

## 0.7.2

### Patch Changes

- 09bea7c: Fix reprocessing timing out for brands with many prompts.
- @workspace/config@0.7.2
  - @workspace/deployment@0.7.2
  - @workspace/lib@0.7.2

## 0.7.1

### Patch Changes

- f06d0c1: Split rare cases where many tracked companies result in too large Jev calls.
- @workspace/config@0.7.1
  - @workspace/deployment@0.7.1
  - @workspace/lib@0.7.1

## 0.7.0

### Minor Changes

- f5b579c: **Jev (TypeSafe) is now a required dependency of Elmo: the worker won't start without `TYPESAFE_API_KEY`.** Jev judges mentions and sentiment, which is far more accurate toward your brand and each competitor. It costs very roughly $0.15–0.35 per 1,000 answers that name a tracked company, more for long answers that name many. Upgrading re-judges the last 90 days of answers once, about three months' worth of that cost; set `REPROCESS_DAYS=all` before upgrading to re-judge your whole history instead.

### Patch Changes

- 0ac774b: Read the text of older ChatGPT and Claude responses recorded before Elmo stored which provider fetched them.
- 55973f9: Re-judge history only for enabled prompts and brands, and only over the last 90 days by default (`REPROCESS_DAYS`); a prompt or brand enabled again has that window brought up to date then.
- Updated dependencies [0ac774b]
- Updated dependencies [f5b579c]
  - @workspace/lib@0.7.0
  - @workspace/deployment@0.7.0
  - @workspace/config@0.7.0

## 0.6.2

### Patch Changes

- @workspace/config@0.6.2
  - @workspace/deployment@0.6.2
  - @workspace/lib@0.6.2

## 0.6.1

### Patch Changes

- @workspace/config@0.6.1
  - @workspace/deployment@0.6.1
  - @workspace/lib@0.6.1

## 0.6.0

### Minor Changes

- a76b237: Decide brand and competitor mentions with a bundled local model that matches whole words and reads each mention in context, so names that are also ordinary words no longer inflate visibility; past responses are re-judged in the background after upgrading.

### Patch Changes

- Updated dependencies [1334ce8]
  - @workspace/lib@0.6.0
  - @workspace/deployment@0.6.0
  - @workspace/config@0.6.0

## 0.5.2

### Patch Changes

- Additional backfill speedups and crash prevention.
- Updated dependencies [d93ea18]
  - @workspace/config@0.5.2
  - @workspace/deployment@0.5.2
  - @workspace/lib@0.5.2

## 0.5.1

### Patch Changes

- Improve rollup backfill speed.
- @workspace/config@0.5.1
  - @workspace/deployment@0.5.1
  - @workspace/lib@0.5.1

## 0.5.0

### Minor Changes

- f1daf53: All stats in the UI and API are significantly faster. This is a large migration and there may be a delay for stats to appear initially as the worker backfills.

### Patch Changes

- a55f182: Editing a brand's name, aliases or competitors now updates mentions in past responses too, not only in new ones.
- Updated dependencies [f1daf53]
- Updated dependencies [a55f182]
  - @workspace/lib@0.5.0
  - @workspace/deployment@0.5.0
  - @workspace/config@0.5.0

## 0.4.6

### Patch Changes

- @workspace/config@0.4.6
  - @workspace/deployment@0.4.6
  - @workspace/lib@0.4.6

## 0.4.5

### Patch Changes

- Updated dependencies [4ec5ac9]
- Updated dependencies [9957eef]
  - @workspace/lib@0.4.5
  - @workspace/deployment@0.4.5
  - @workspace/config@0.4.5

## 0.4.4

### Patch Changes

- 76ec134: Reports accept other names a brand goes by, and count a mention of any of them as a brand mention.
- Updated dependencies [b48f545]
- Updated dependencies [1980c7d]
- Updated dependencies [280e5f3]
- Updated dependencies [76ec134]
  - @workspace/config@0.4.4
  - @workspace/lib@0.4.4
  - @workspace/deployment@0.4.4

## 0.4.3

### Patch Changes

- 64a2580: The worker now lists every missing environment variable and misconfigured scrape target at startup instead of stopping at the first one.
- Updated dependencies [10bc2f0]
  - @workspace/lib@0.4.3
  - @workspace/deployment@0.4.3
  - @workspace/config@0.4.3

## 0.4.2

### Patch Changes

- @workspace/config@0.4.2
  - @workspace/deployment@0.4.2
  - @workspace/lib@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [e2543e8]
  - @workspace/lib@0.4.1
  - @workspace/deployment@0.4.1
  - @workspace/config@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [f6e90d9]
- Updated dependencies [99f537c]
- Updated dependencies [c9142f7]
- Updated dependencies [aa8c80d]
  - @workspace/lib@0.4.0
  - @workspace/deployment@0.4.0
  - @workspace/config@0.4.0

## 0.3.0

### Minor Changes

- 78593b9: Adds support for [Elmo Cloud](https://app.elmohq.com/).

### Patch Changes

- 78593b9: Recovering from a provider failure now re-runs only the models that missed their sample instead of re-sampling every model.
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
  - @workspace/config@0.3.0
  - @workspace/deployment@0.3.0

## 0.2.19

### Patch Changes

- dac89d4: Waiting out a busy scraping provider's queue no longer abandons requests it has already charged for, and a prompt whose runs all fail now backs off instead of being retried immediately.
- Updated dependencies [dac89d4]
  - @workspace/lib@0.2.19
  - @workspace/whitelabel@0.2.19
  - @workspace/deployment@0.2.19

## 0.2.18

### Patch Changes

- Updated dependencies [d0187ed]
- Updated dependencies [bfa6282]
- Updated dependencies [9394d65]
- Updated dependencies [d9faaec]
- Updated dependencies [72e7091]
  - @workspace/lib@0.2.18
  - @workspace/whitelabel@0.2.18
  - @workspace/deployment@0.2.18

## 0.2.17

### Patch Changes

- @workspace/whitelabel@0.2.17
- @workspace/deployment@0.2.17
- @workspace/lib@0.2.17

## 0.2.16

### Patch Changes

- Updated dependencies [91de584]
  - @workspace/lib@0.2.16
  - @workspace/whitelabel@0.2.16
  - @workspace/deployment@0.2.16

## 0.2.15

### Patch Changes

- @workspace/deployment@0.2.15
- @workspace/lib@0.2.15
- @workspace/whitelabel@0.2.15

## 0.2.14

### Patch Changes

- @workspace/lib@0.2.14
- @workspace/whitelabel@0.2.14

## 0.2.13

### Patch Changes

- @workspace/lib@0.2.13
- @workspace/whitelabel@0.2.13

## 0.2.12

### Patch Changes

- 7ce34f1: Fixes bug where in some cases BrightData processing could get stuck.
  - @workspace/lib@0.2.12
  - @workspace/whitelabel@0.2.12

## 0.2.11

### Patch Changes

- @workspace/lib@0.2.11
- @workspace/whitelabel@0.2.11

## 0.2.10

### Patch Changes

- Updated dependencies [520aef4]
  - @workspace/lib@0.2.10
  - @workspace/whitelabel@0.2.10

## 0.2.9

### Patch Changes

- a2a9681: Attach a `boss.on("error")` handler so transient pg-boss connection blips no longer crash the worker.
  - @workspace/lib@0.2.9
  - @workspace/whitelabel@0.2.9

## 0.2.8

### Patch Changes

- @workspace/lib@0.2.8
- @workspace/whitelabel@0.2.8

## 0.2.7

### Patch Changes

- 1e770ff: Publish multi-arch (`linux/amd64` + `linux/arm64`) Docker images for `elmohq/elmo-web` and `elmohq/elmo-worker`, so Apple Silicon and other arm64 hosts can pull them.
  - @workspace/lib@0.2.7
  - @workspace/whitelabel@0.2.7

## 0.2.6

### Patch Changes

- @workspace/lib@0.2.6
- @workspace/whitelabel@0.2.6

## 0.2.5

### Patch Changes

- 76e2a5f: Add telemetry opt-out prompt during `elmo init` and new `elmo telemetry status|enable|disable` subcommand. See [Telemetry](https://elmohq.com/docs/developer-guide/telemetry) for what's collected.
- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.
- 839b98b: Brand onboarding is now a single screen: paste a website and review the suggested products, competitors (with their own domains and aliases), additional brand domains, aliases, and tagged starter prompts before saving. Powered by whichever direct LLM API you've configured (OpenRouter, Anthropic, OpenAI, or Mistral) with web search.
- Updated dependencies [7990382]
- Updated dependencies [edf97d4]
- Updated dependencies [7cba46d]
- Updated dependencies [839b98b]
  - @workspace/lib@0.2.5
  - @workspace/whitelabel@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [67a0389]
  - @workspace/lib@0.2.4
  - @workspace/whitelabel@0.2.4

## 0.2.3

### Patch Changes

- @workspace/lib@0.2.3
- @workspace/whitelabel@0.2.3

## 0.2.2

### Patch Changes

- 06fb190: Worker dispatch now reads `SCRAPE_TARGETS` end-to-end via the provider registry. Deployments that configure non-default providers no longer hit `AI_LoadAPIKeyError` for providers they never set up, the worker fails fast at startup on misconfigured `SCRAPE_TARGETS`, and `brand.enabledModels` filters per brand.
- Updated dependencies [63a6c22]
- Updated dependencies [06fb190]
  - @workspace/lib@0.2.2
  - @workspace/whitelabel@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [adf7642]
  - @workspace/lib@0.2.1
  - @workspace/whitelabel@0.2.1

## 0.2.0

### Minor Changes

- 95b71db: Replace visibility % with Share of Voice metric across reports, add reports API, and redesign report for print

### Patch Changes

- Updated dependencies [95b71db]
  - @workspace/lib@0.2.0
  - @workspace/whitelabel@0.2.0

## 0.1.2

### Patch Changes

- @workspace/lib@0.1.2

## 0.1.1

### Patch Changes

- Initial release: Extracted worker from web app into standalone app.
