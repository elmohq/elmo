# Measurement

Contents: building the prompt set · sampling · metrics · comparing before and after ·
first-party data · manual fallback

## Building the prompt set

A prompt set is a sample of the questions buyers ask answer engines. Its quality limits everything
downstream, so build it from evidence of real demand:

| Source | What to pull |
| --- | --- |
| Search Console queries | Long, question-shaped queries (6+ words, "how", "best", "vs", "for") with impressions. The closest public proxy for conversational demand. |
| Sales calls, support tickets, onboarding forms | The words customers use for their problem before they know the brand. Often the best source, and usually missing. |
| Reddit, forums, community Q&A | Threads where people ask for recommendations in the category. |
| People Also Ask, autocomplete | Phrasing variants. |
| Competitor comparisons | "X vs Y", "alternatives to X", "X pricing", for each competitor in the locked set. |
| Elmo query fan-out | Once tracking runs, the searches engines actually performed. Feed recurring ones back in as prompts. |

Tag every prompt:

- **Intent:** `discovery` (best X for Y), `comparison` (X vs Y, alternatives), `use-case` (how to do
  Z, which tool for persona P), `branded` (what is Brand, Brand pricing, is Brand good for …).
- **Topic or product line**, so results can be split the way the business is organized.
- **Persona or market**, where buyers differ.

Rules of thumb:

- Aim for roughly 70–85% unbranded prompts. Branded prompts check accuracy, while unbranded prompts
  measure visibility. A brand that is only visible in branded prompts is invisible to new buyers.
- Write 2–3 phrasings per important intent. Real users phrase the same need very differently, and
  one phrasing over-fits.
- Write the way people type into a chat box: full sentences, context, constraints ("for a 10-person
  agency on a budget"). Don't write keyword strings.
- Drop prompts that wouldn't change a buying decision. Thirty sharp prompts beat 300 vague ones.
- Freeze the set once tracking starts. Add prompts, but don't edit existing ones, or the history
  stops being comparable.

## Sampling

One run of one prompt is an anecdote. Brand lists change on nearly every run, while the share of
runs naming a given brand is fairly stable. Measure that share.

- **Per prompt, per engine:** about 5 runs is enough to explore, about 10 to confirm a finding, and
  15 or more for rigorous claims. Elmo accumulates runs on a schedule, so read rates across a window
  (7–30 days) rather than per day.
- **Per engine, separately.** Never pool ChatGPT and AI Overviews into one number without also
  showing them apart. Their sources and behavior differ.
- **Consumer surfaces versus raw model APIs.** Calling a model's API, even with web search on,
  doesn't reproduce what ChatGPT or AI Mode users see. Prefer scraped consumer surfaces for
  visibility work. Label API-only data as such.

### Is the difference real?

For a rate *p* measured over *n* runs, the 95% margin is roughly `±2 × sqrt(p × (1 − p) / n)`.

| Runs (n) | Margin at p = 0.3 |
| --- | --- |
| 20 | ±20 points |
| 50 | ±13 points |
| 100 | ±9 points |
| 300 | ±5 points |

Two windows differ meaningfully only when the gap is clearly larger than both margins. At small n,
say "no detectable change", not "down 8 points".

When you read exported data, count with code where you can, and quote exact numerators and
denominators. Eyeballed counts drift.

## Metrics

| Metric | Definition | Notes |
| --- | --- | --- |
| Mention rate (visibility) | Share of runs whose answer names the brand | The headline number. Report per engine and per intent tag. |
| Citation rate | Share of runs that link to an owned URL | Separate from mentions. A page can be cited while a competitor gets recommended. |
| Share of voice | Brand mentions ÷ mentions of brand + locked competitors | Only meaningful against a fixed, named competitor set. Say which set. |
| Cited domains and URLs | Which pages engines used, grouped by owned, competitor, editorial, UGC, and reference | The diagnostic. Drives content and off-site work. |
| Fan-out queries | The searches an engine ran while answering | Tells you which queries to rank for. |
| Recommendation rate | Share of runs where the answer recommends the brand for the stated need | Read from stored answers. See "Cited is not recommended" below. |
| Accuracy | Wrong facts and negative framing in branded answers | Track as a list of issues, each with a source, not a score. |

Avoid average position, "AI rank", and composite scores. They hide the variance that matters.

### Cited is not recommended

A brand moves up four steps in an answer, and each one needs different work:

1. **Retrieved:** one of its pages is among the sources the engine read.
2. **Cited:** the answer links to that page.
3. **Mentioned:** the answer names the brand.
4. **Recommended:** the answer puts the brand forward as a fit for the user's need, not in passing,
   not as an option to avoid, and not only as a source.

Engines regularly cite a brand's page and recommend a competitor, especially when the page is the
brand's own "best X" list (`evidence.md`). Mention rate counts steps 3 and 4 together, so read the
answers to separate them. For the discovery and comparison prompts, classify each run's mention as
*recommended*, *listed*, *mentioned negatively*, or *cited only*, then report the recommendation rate
with n like any other rate. In Elmo, `get_run` returns the full answer text. Sample enough runs per
engine to clear the margins above, and label the result *Measured*.

Which step a brand stalls at points to the fix:

| Stalls at | Usual cause | Where to work |
| --- | --- | --- |
| Not retrieved | Blocked, unindexed, or no page for the query or its fan-out | `technical.md`, `content.md` |
| Retrieved, not cited | The page doesn't answer the query plainly, or a better page exists | `content.md` |
| Cited, not mentioned | The page is used as background, but it doesn't name the brand where it matters | `content.md` |
| Mentioned, not recommended | Other sources don't back the brand for this need, or describe it differently | `off-site.md` |

## Comparing before and after

1. Keep a change log: the date, what shipped (URL or campaign), and the prompts and engines it targets.
2. Pick equal windows before and after. Leave a lag after the change: crawling, indexing, and
   engines refreshing their sources take days to weeks, and earned coverage can take longer.
3. Compare the *targeted* prompts against untargeted ones as a rough control. If both moved, the
   cause is probably the engine, not the change.
4. Check for model and product changes in the window. In Elmo, `list_models` shows what is being
   sampled now. A break that hits every brand on the same date is the engine changing.
5. Report the delta with both margins, and the evidence label *Measured*.

## First-party data

None of these show what the answer said, but they are free and authoritative for their own engine.

- **Google Search Console, Performance report:** clicks and impressions from AI Overviews and AI Mode
  are already included in the "Web" search type, mixed in with ordinary results.
- **Google Search Console, generative AI performance report** (rolled out worldwide 31 Aug 2026):
  impressions of your links in AI Overviews and AI Mode, combined, by page, country, device, and
  date. No queries, clicks, or position, and no API export as of late 2026. Use it to see which
  pages Google's AI features surface. Search Console also has a **Search generative AI** control for
  opting a site out of those features.
- **Bing Webmaster Tools, AI Performance:** citations in Copilot and Bing AI answers, cited URLs, and
  the grounding queries behind them. The only first-party report that shows queries.
- **Analytics referrals:** set up a channel for AI referrers, including `chatgpt.com` (and
  `utm_source=chatgpt.com`), `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`,
  `claude.ai`, and `chat.mistral.ai`. Expect this to undercount, because many AI-originated visits
  arrive as direct traffic. Don't quote conversion multipliers from other companies' data.
- **Server or CDN logs:** filter by the user agents in `references/technical.md` to confirm AI
  crawlers can reach the pages that matter, and to see when they fetch them. Verify by published IP
  ranges where the vendor provides them, because user agents are easy to spoof.

## Manual fallback (no Elmo)

Use this only for a first look. Label everything *Estimated (manual, n = …)*.

1. Use a clean session for each engine: logged out, or a fresh profile with memory and
   personalization off, in the target country.
2. Run each prompt 3–5 times per engine, each in a new chat.
3. Record one row per run:

```csv
date,engine,prompt_id,run,brand_mentioned,brand_cited_url,competitors_mentioned,cited_domains,wrong_facts,notes
```

4. Compute rates per engine from the rows and show n beside every number.

Manual sampling is slow and drifts with personalization and location. For anything you'll re-measure,
set up tracking (`references/elmo.md`).
