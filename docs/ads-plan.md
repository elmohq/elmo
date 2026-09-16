# Ads page — plan (issue #168, "chatgpt ads tracking")

## TL;DR

**Yes, we already collect the data — it's retroactive back to 2026-05-11.** BrightData's
ChatGPT scraper returns an `ads` object on every run and we persist it verbatim in
`prompt_runs.raw_output` (the provider explicitly keeps "all structured data (shopping,
recommendations, citations, etc.)" and only strips HTML). Nothing needs to change in the
scrape pipeline to have history.

**Our ChatGPT ad capture stopped on 2026-08-25 — but ads did not.** Independent trackers put
ChatGPT ad penetration at ~51% of US replies and holding, so the zero is ours to fix. On one
day every field that only exists when BrightData's collector completes a real browsing turn —
`web_search_triggered`, `search_sources`, `web_search_query`, `model` and `ads` — dropped
together, while `citations` kept working. Nothing changed on our side.

**The highest-value fix is a provider change, not a ticket.** Cloro sells ChatGPT ad
monitoring and exposes it behind an `include.ads` flag; our Cloro provider already builds that
exact `include` object for ChatGPT and asks for two of its six fields, omitting `ads`. The same
switch also fixes **ChatGPT query fan-out, which has been answering "unavailable" for three
weeks** — a live user-visible bug nobody had noticed. Evidence, per-provider support matrix and
the eligibility rules that make ads invisible to the wrong kind of session are in §5.

**Google AI Mode ads are live and growing**, so the page is **Ads**, not ChatGPT Ads: one
extraction pass, two surfaces, filterable by either. That is what keeps the page useful
today regardless of how the ChatGPT question resolves, and Google AI Overview's `bottom_ads`
slots in later with no schema change.

**Performance:** reading ads out of `raw_output` at request time is a non-starter —
`prompt_runs` is 2 GB of TOAST for 74k rows (avg 24 KB/row) and a single de-TOASTing
aggregate over a 30-day window already takes **~800 ms warm** on the demo DB; the
competitor-join version of the same query **timed out at 120 s**. This needs a normalized
`ad_impressions` table written at ingest, exactly like `citations`. At ~9% blended ad rate
the table lands around 9k rows / <10 MB on the demo dataset — roughly 1% of what `citations`
costs (673 MB / 1.1M rows), so it is comfortably faster than the Citations page.

**This should land on top of PR #711, not before it.** That PR's replayable-extraction layer
gives ads its entire backfill for free: ads are an L1 extraction artifact, so bumping
`EXTRACTOR_VERSION` replays every stored run and fills `ad_impressions` across all history
with no bespoke job. Its plan doc already names "ChatGPT ads detection" as the motivating
example. Full analysis in §2.

---

## 1. What we actually have

### 1.1 ChatGPT (BrightData `gd_m7aof0k82r803d5bjm`)

Every ChatGPT run's `raw_output` carries an `ads` key. It is a declared output field of the
dataset, though absent from BrightData's prose docs (§5). When no ad ran it is
`{"carousel_cards": null}`. When an ad ran:

```json
{
  "url": "https://www.airops.com/",
  "name": "AirOps",
  "favicon_url": "data:image/webp;base64,…",
  "carousel_cards": [
    {
      "title": "Take Control of Your AI Search Visibility",
      "body": "Tracking AI visibility is step one. AirOps turns it into pipeline. See the platform live.",
      "image_url": "https://bzrcdn.openai.com/tessera/….webp",
      "target_url": "https://www.airops.com/?utm_source=chatgpt&utm_medium=paid&campaign_id=cmpn_…&ad_group_id=adgrp_…&ad_id=ad_…&ad_account_id=adacct_…&oppref=…&olref=…"
    }
  ]
}
```

- `name` is the **OpenAI-verified advertiser legal name** ("SEOSpace, LLC",
  "Searchable Ltd", "リンクシェア・ジャパン株式会社"), not a brand name. Useful to display,
  useless as a join key.
- `url` is the advertiser's canonical site — **this is the competitor join key.**
- `carousel_cards` is 1 card in 98% of cases, up to 5.
- `favicon_url` is an inline base64 data URI, often 5–10 KB. **Do not store it** — resolve
  the favicon from the domain via the existing `SiteIcon` component instead.
- UTM/campaign ids are only present when the advertiser used OpenAI's auto-tagging:
  `utm_source=chatgpt` on 49% of cards, `campaign_id`/`ad_id` on only **8%**. Campaign-level
  reporting is therefore not viable; **advertiser + creative is the reliable unit.**

### 1.2 Google AI Mode (BrightData `gd_mcswdt6z2elth3zqr2`)

`ads` is an array, populated on 5–7% of runs *today*:

```json
[{
  "url": "https://www.google.com/aclk?…&adurl&ved=…",
  "title": "Run an LLM fully offline - Run agents offline on one GPU - Open source, Apache 2.0",
  "domain": "developer.meta.com",
  "description": "Muse Glimmer is built for privacy: prompts, data and inference all stay on your device."
}]
```

Caveats: `url` is a Google `aclk` redirect (the real landing page is not in the payload),
and `domain` is sometimes a display name rather than a host ("Avnet", "Amsive"). Rule: if
`domain` parses as a host, it is the domain and the key; otherwise it is the advertiser name,
the domain is null, and the key is the name. Such an advertiser can never be matched to a
tracked competitor, which is a real limitation of the surface, not something to paper over.

### 1.3 Google AI Overview

`bottom_ads` array, present on ~2.5% of runs. Same shape family. **Out of scope for v1** —
adding it later is one extractor plus one entry in `AD_CAPABLE_MODELS`, with no migration.

### 1.4 Coverage / history

| Surface | First ad seen | Last ad seen | Ad rate (window) | Distinct advertisers |
|---|---|---|---|---|
| ChatGPT (demo DB) | 2026-05-11 | 2026-08-27² | 12.0% (Jul 1 – Aug 27) | 414 |
| ChatGPT (cloud DB) | 2026-08-10¹ | 2026-08-27² | 6.5% | 209 |
| Google AI Mode (demo DB) | 2026-08-03 | ongoing | 5.3% and rising | — |

¹ cloud `prompt_runs` retention starts later; demo has the deeper history.
² the collector broke on 2026-08-25 (§5); the handful of ads after that date come from the
~2% of runs that still completed a browsing turn.

Ads rotate hard — the most any single advertiser/prompt pair repeated in 18 days was 4.
This matters for design: **share and coverage are the meaningful metrics, raw counts are
noisy.**

### 1.5 Why this is a compelling feature (real Elmo data, Aug 2026)

Against Elmo's own tracked prompts, on ChatGPT:

| Prompt | Advertiser | Creative |
|---|---|---|
| List open source AI visibility tracking (AEO) tools | AirOps | "Take Control of Your AI Search Visibility" |
| What tools monitor citations in AI Overviews? | AirOps | "G2's #1 AI Search Visibility Platform" |
| AEO vs SEO — what's the difference? | Profound | "Win More Visibility In AI Search" |
| What is the best AEO tool for e-commerce brands? | Searchable Ltd | "See Your AI Visibility" |
| Is Elmo the best open source AI visibility tracker? | Digital Space Marketing LLC | "Technical SEO That Drives Growth" |

And on Google AI Mode, which is live today:

| Prompt | Advertiser | Creative |
|---|---|---|
| What is answer engine optimization? | Ahrefs | "SEO vs GEO — Optimize for GEO & AEO — See Your Brand in AI & More" |
| AEO vs SEO — what's the difference? | Amsive | "Top AEO SEO Strategies — Rank High In AI Search Results" |

Direct competitors are buying against our exact prompt set, and we can read their ad copy.
That is the pitch.

---

## 2. Architecture

### 2.1 New table: `ad_impressions`

Modelled directly on `citations` — same denormalized tenancy columns, same
`created_at` copied from the run so every read filters on one index.

```ts
export const adImpressions = pgTable(
  "ad_impressions",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    promptRunId: uuid("prompt_run_id").references(() => promptRuns.id).notNull(),
    promptId: uuid("prompt_id").references(() => prompts.id).notNull(),
    brandId: text("brand_id").references(() => brands.id).notNull(),
    model: text("model").notNull(),
    /** Stable identity: the domain when there is one, else the reported name. Google AI
     *  Mode hides the landing page behind a Google redirect and sometimes reports a
     *  display name in the domain field, so a domain cannot be the key. */
    advertiserKey: text("advertiser_key").notNull(),
    /** Verified advertiser name as the surface reports it. */
    advertiserName: text("advertiser_name"),
    /** Registrable host of the advertiser's site — the competitor join key. Null when the
     *  surface only exposed a redirect or a display name. */
    advertiserDomain: text("advertiser_domain"),
    headline: text("headline"),
    body: text("body"),
    /** Landing page, redirect chain unresolved. */
    targetUrl: text("target_url"),
    imageUrl: text("image_url"),
    /** Slot order within the run, so a 5-card carousel keeps its shape. */
    cardIndex: smallint("card_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    brandAnalyticsIdx: index("ad_impressions_brand_created_analytics_idx").on(
      table.brandId, table.createdAt, table.advertiserKey, table.advertiserDomain,
      table.promptId, table.model, table.headline,
    ),
    promptCreatedIdx: index("ad_impressions_prompt_id_created_at_idx").on(table.promptId, table.createdAt),
    advertiserKeyIdx: index("ad_impressions_advertiser_key_idx").on(table.advertiserKey),
    // One row per card per run — makes the backfill and any provider retry idempotent.
    runCardIdx: uniqueIndex("ad_impressions_run_card_idx").on(table.promptRunId, table.cardIndex),
  }),
).enableRLS();
```

The covering index mirrors `citations_brand_created_analytics_idx`, which is what makes
the Citations page index-only. Truncated `headline`/`body` (256 chars, reusing
`normalizeCitationTitle`'s pattern) keeps the index entries small.

**Deliberately not stored:** `favicon_url` (base64, huge, derivable), campaign ids (present
on 8% of rows — parse from `targetUrl` at read time if we ever want them).

### 2.2 Denominator

Ad *rate* needs a denominator ("of the answers to your prompts, how many carried an ad").
`prompt_runs` filtered by brand/model/window already provides it over an existing index
(`prompt_runs_model_created_at_idx`); after PR #711 it is `rollup_prompt_runs.runs`, which
is cheaper still and needs no new measure.

Two filters the denominator must apply, or every number on the page is diluted:

- **Ad-capable models only.** Ads exist on the consumer products we scrape, and only two of
  them expose the field: ChatGPT and Google AI Mode. `AD_CAPABLE_MODELS` in
  `@workspace/config/models` is the single list; the page's platform filter reads from it
  too, so the filter and the denominator cannot drift.
- **Scraped runs only.** An API-routed run (`chatgpt:openrouter`) never shows an ad.
  `postgres-read.ts` already draws exactly this line in `modelFilter` via `API_PROVIDER_IDS`;
  after PR #711 `provider` is part of the rollup grain, so it is a plain predicate.

### 2.3 Extraction — an L1 concern, and why that matters

New `extractAdsFrom{Brightdata,Dataforseo,…}` in `packages/lib/src/text-extraction.ts`,
dispatched by an `extractAds(rawOutput, providerOrEngine)` twin of `extractCitations`.
Returns `AdImpression[]`. `ScrapeResult` gains `ads: AdImpression[]`; providers that cannot
see ads return `[]`.

Ads are **extraction**, not interpretation: the advertiser name, domain and creative are
read straight out of the payload and are identical for every tenant. The brand-vs-competitor
attribution is a domain-membership test over two small sets, applied at read time exactly as
`categorizeDomain` already does for citations. So ads need **no deriver** — they sit beside
`citations` in PR #711's L1 layer, versioned by `EXTRACTOR_VERSION`.

### 2.4 Worker

`runModelIteration` in `apps/worker/src/jobs/process-prompt.ts` gets a `saveAdImpressions`
call next to `saveCitations`, reusing the run's `createdAt` so the window filters line up
exactly with citations.

### 2.5 Backfill — free, if this lands after PR #711

**On `main` today** ads would need a bespoke one-shot job: `raw_output` is TOASTed, so a
backfill has to walk `created_at` in batches with `ON CONFLICT (prompt_run_id, card_index)
DO NOTHING` to stay resumable. Roughly 74k runs × 24 KB ≈ 1.8 GB of TOAST reads.

**On top of PR #711 that job does not exist.** The relevant machinery is already there:

- `extractRun(rawOutput, providerOrEngine)` returns `{ textContent, citations }` and is the
  single extraction entry point. Ads become a third key.
- `reprocess` replaces a run's citations wholesale whenever `prompt_runs.extractor_version`
  is behind `EXTRACTOR_VERSION` (`replaceCitations`). `replaceAdImpressions` is the same
  five lines.
- Bumping `EXTRACTOR_VERSION` 1 → 2 is detected on worker start and enqueues the global
  `reprocess`, which walks every brand's history by keyset cursor, at low concurrency behind
  live prompt processing, and marks the buckets it touched dirty.

That is the whole backfill. The rollups plan names this case explicitly: *"a bug fix or a new
provider payload shape, or a new deriver such as ads detection, is a version bump plus the
rows it needs, never a one-off script."* Self-hosters get it on their next upgrade with no
extra step.

### 2.5.1 Do ads need rollup tables?

Not for v1, and the answer is a measurement rather than a preference. `citations` is 1.1M
rows / 673 MB on the demo dataset and is what PR #711 exists to make fast. `ad_impressions`
over the same data is ~9k rows / <10 MB — two orders of magnitude smaller, over a covering
index of the same shape. A brand-wide "all time" scan is trivial.

When ad volume justifies it, adding `rollup_ad_advertisers` is mechanical in that
architecture and needs no new concepts:

1. A table on the same `(brand_id, bucket, prompt_id, model, provider, web_search_enabled)`
   grain plus `advertiser_key`, with `impressions` as the measure.
2. One entry in `rebuildRange`'s `clearRange` table list and one `INSERT … SELECT … GROUP BY`
   beside `insertCompetitorRollup` — ads need no TypeScript aggregation pass, since there is
   no per-URL classification to do.
3. Bump `ROLLUP_VERSION`, which marks every bucket `schema` and refills them.

The one wrinkle worth flagging: the rollup grain keys competitor mentions by **name** to
survive competitor ids churning (#709). Ads should key by `advertiser_key` — domain when the
surface gives one, reported name when it does not — for the same reason, and because Google
AI Mode genuinely has no domain on some rows.

### 2.6 Read path — `apps/web/src/server/ads.ts`

Mirrors `server/citations.ts`: a `createServerFn` that resolves the brand session, applies
the tag/model/lookback filters, and issues a small number of grouped aggregates against
`ad_impressions` (plus one count against `prompt_runs` for the denominator). Roll-up in
memory in `apps/web/src/lib/ad-rollup.ts`, the way `citation-rollup.ts` does, so the
worker-maintained rollup tables can slot underneath later without touching the components.

Queries needed (all single-index scans on `ad_impressions`):

1. per-advertiser: impressions, distinct prompts, first/last seen, models seen on
2. per-prompt: impressions, per-advertiser counts
3. per-creative: `(model, advertiser_key, headline, body)` impressions + example
   image/target
4. daily: impressions per day, for the trend
5. previous-window per-advertiser impressions, for "started / stopped" (same trick as
   `rollUpPreviousPeriod`)
6. denominator: eligible runs per day per model
7. last ad per model at any time, which is what separates "nobody is buying" from "the
   platform went quiet" (§3.1) — a single `MAX(created_at) GROUP BY model` with no window
   bound, served by the same index

Competitor/brand attribution reuses `categorizeDomain(domain, brandDomains, competitorDomains)`
from `lib/domain-categories.server.ts` — so an advertiser is classified `brand` /
`competitor` / `other` on exactly the rules the Citations page already uses, and the
"Track as competitor" popover (`TrackDomainPopover`) drops straight in. Advertisers with no
resolvable domain are always `other` and cannot be tracked; the UI hides the affordance
rather than offering one that would not work.

### 2.7 Performance budget

| | Citations | Ads (projected) |
|---|---|---|
| Rows (demo dataset) | 1,108,261 | ~9,000 |
| Table size | 673 MB | <10 MB |
| Aggregates per page load | 8 | 7 |

Ads is ~1% of the Citations row count, over an index with the same shape. It should be
*faster* than Citations, not merely as fast — which is the bar this was asked to clear.

### 2.8 Things that also need touching

- `apps/web/src/components/app-sidebar.tsx` — add `Ads` to the Dashboard group.
- `apps/web/src/routes/_authed/app/org/$org/brand/$brand/ads.tsx` — the route, composing
  `FilteredListShell` with `trackedTargets` narrowed to `AD_CAPABLE_MODELS`.
- Prompt detail page — an "Ads" tab alongside citations for that prompt, where the auction
  matrix collapses to a single prompt row.
- `packages/api-spec/src/openapi.json` + `apps/web/src/routes/api/v1/brands/$brandId/ads/` —
  match the citations endpoints (`/advertisers`, `/creatives`).
- `packages/docs/content/docs/user-guide/ads.mdx` + `meta.json`.
- Changeset (user-facing): one patch line scoped to `@workspace/web`, `@workspace/worker`,
  `@workspace/lib`.

---

## 3. What the page shows

Ranked by how much each earns its space.

1. **Ad rate** — share of eligible answers to your prompts that carried an ad, with a
   per-platform breakdown beside it. The blended number alone is misleading: the two
   surfaces behave nothing alike and one of them is currently silent.
2. **Share of ad voice** — of all ad impressions on your prompt set, who holds what share,
   attributed brand / competitor / other. The headline competitive metric.
3. **Contested prompts** — which of your prompts draw ads, and who buys them. Directly
   actionable: it names the queries where an answer alone doesn't win the click.
4. **The auction board** — a prompt × advertiser grid. The only view that answers "who is
   contesting *this* query" without a drill-down.
5. **Creative intelligence** — the literal headline and body competitors are running. The
   most useful artifact on the page for a marketer, and something no organic-visibility view
   can give them.
6. **Movement** — advertisers that entered or left the window. Mirrors the Citations
   "Recent Changes" card.
7. **Paid vs. earned** — advertisers buying ads on your prompts who are *never* cited
   organically, and vice versa. Both sides key on domain, so it is a join over the same
   window and needs no extra collection. Deferred to the follow-up; it is the only section
   that needs a `citations` join, and it earns less than the six above.

Explicitly **not** in v1: campaign/ad-group breakdowns (8% coverage), spend estimates (we
have no auction data and guessing would be dishonest), or ad *position* within the answer
(not in the payload).

### 3.1 The four empty states

Ads are sparse by nature, so "nothing here" is the common case and must not collapse into
one message. The page distinguishes:

| State | What it means | What we say |
|---|---|---|
| No ad-capable platform tracked | ChatGPT and Google AI Mode are both off | Name the two platforms and point at LLM settings |
| Platforms tracked, no answers in window | nothing ran | Suggest a longer period |
| Answers, no ads, none ever seen | genuinely uncontested | Say so plainly — this is the normal case |
| Answers, no ads, but ads seen before | **ambiguous** | Say it is ambiguous: either nobody is buying, or the platform stopped showing ads to us |

That last row is the one that matters, and it is exactly the situation ChatGPT is in right
now. A platform that has gone quiet after previously reporting ads carries a warning on its
row in the platform strip, with the date of the last ad we saw. Reading "0 ads" as "no
competitor is buying" when the truth is "our scraper lost the surface" is the single most
expensive mistake this page could make.

And it is not a hypothetical failure mode. Ad eligibility depends on things no payload
reports (§5): free or logged-out session, US or another English-speaking market. A scraper
that drifts into a paid tier, an authenticated session, or a non-US exit returns a perfectly
valid answer with no ads, indefinitely, and nothing distinguishes that from an uncontested
prompt. The warning is the only place the page can be honest about it.

---

## 4. The page

Built under **Pages/Ads** in Storybook (`pnpm --filter @workspace/web storybook`), reading
`apps/web/src/stories/ads-fixtures.ts` — real captured ChatGPT and Google AI Mode ad
payloads from Elmo's own tracked prompts.

Order: **stats → platform strip → ad-rate trend → advertisers → contested prompts → auction
board → movement → creatives.**

| Component | What it is |
|---|---|
| `stats-cards.tsx` | Ad Rate / Competitor Ad Share / Advertisers / Your Ads |
| `surface-summary.tsx` | per-platform ad rate, and the gone-quiet warning |
| `ad-rate-chart.tsx` | daily ad rate, stacked by attribution |
| `top-advertisers-card.tsx` | ranked advertisers, expandable to their prompts, "track as competitor" inline |
| `contested-prompts-card.tsx` | prompts by ad rate, with the advertisers on each |
| `auction-matrix.tsx` | prompt × advertiser heatmap |
| `movement-card.tsx` | started / stopped buying vs. the previous window |
| `creative-gallery.tsx` | the ad copy itself, filterable and searchable |
| `empty-states.tsx` | the four nothings above |
| `paid-vs-earned-card.tsx` | built, not yet placed — needs the `citations` join |

The auction board sits after both ranked lists rather than leading. It is the densest thing
on the page, and it reads far better once the advertiser and prompt names in it are already
familiar. Leading with it was a variant we looked at and rejected.

### Platform filtering

The page uses the existing `FilteredListShell` filter bar, with `trackedTargets` narrowed to
`AD_CAPABLE_MODELS`, so platform selection is the same URL-backed control as every other
dashboard page and no new filter vocabulary is introduced. Within the page, each advertiser
row and each creative card carries the platform's icon, because the same advertiser buying
on both surfaces is two different buys.

### Design notes

- Attribution colour reuses `CATEGORY_CONFIG` from the Citations page, so an advertiser reads
  the same colour here as its domain does there. Brand (`#2563eb`) and competitor (`#ef4444`)
  pass the CVD and contrast checks; "other" is the de-emphasis grey for the long tail, and
  every surface that uses it also direct-labels the row.
- The matrix's cell shading is a single sequential ramp on the foreground ink — magnitude
  only. Attribution stays on the row label's dot, so colour never does two jobs at once.
- The rate chart does **not** use the Citations pages' fixed 0–100% axis: ad rate lives in
  the single digits to low teens, and a percent axis running to 100 flattens the series into
  the baseline.
- Advertiser domain is nullable throughout. Google AI Mode puts a Google `aclk` redirect in
  its URL field and sometimes a display name ("Avnet") where a host belongs, so rows key on
  `advertiserKey` and the domain-dependent affordances — the favicon, the host label, "track
  as competitor" — are conditional.

---

## 5. ChatGPT ads: what the live probes found

Three ChatGPT scrapers were run directly against the production credentials on 2026-09-16,
with prompts that reliably drew ads in August plus a high-commercial-intent control:

| Provider | Ads in payload | Ad markers in the raw, un-stripped body |
|---|---|---|
| BrightData (`gd_m7aof0k82r803d5bjm`) | `{"carousel_cards": null}` | **none** in 754 KB of `answer_html` — no `bzrcdn.openai.com/tessera`, no `utm_medium=paid`, no "Sponsored" |
| DataForSEO LLM Scraper | no `ads` field exists; `item_types` are `chat_gpt_text` / `chat_gpt_products` / `chat_gpt_table` | none |
| Oxylabs | no `ads` field exists | none in `raw_response`, which is ChatGPT's own SSE conversation stream |

So the answer to "is it available somewhere else in the dataset" is **no**. BrightData's
`ads` field is the only carrier any of our providers has, it is genuinely empty, and the
content is absent from the underlying HTML too — this is not a field we are failing to read.

The sharpest single probe: `country: "US"` plus a deliberately commercial prompt ("best noise
cancelling headphones to buy right now"), where the **shopping carousel rendered**
(`shopping_visible: true`, six products) — so the collector did reach the monetizable part of
the answer — and `ads` was *still* null, alongside `model: null` and `web_search_query: null`.
The product carousel works; the ad carousel does not. That is about as specific as a bug
report gets.

### When it happened, and what else broke with it

The cliff is **2026-08-25**, and ads were not the only casualty. Five fields collapsed on the
same day while `citations` kept working:

| Date | runs | `web_search_triggered` | `search_sources` | `web_search_query` | `model` | ads |
|---|---|---|---|---|---|---|
| 2026-08-23 | 232 | 112 | 112 | 114 | 115 | 51 |
| 2026-08-24 | 231 | 89 | 88 | 88 | 90 | 37 |
| **2026-08-25** | 232 | **3** | **3** | **3** | **4** | **0** |
| 2026-08-28 | 225 | 1 | 1 | 1 | 3 | 0 |
| 2026-09-02 | 284 | 262 | 270 | 1 | 11 | 0 |
| 2026-09-15 | 327 | 317 | 320 | 3 | 6 | 0 |

Those five are exactly the fields that only exist when the collector completes a real browsing
turn inside the full ChatGPT product. `citations` survives because it is parsed from inline
links in the answer text. So this is not "ads were removed" — **the collector stopped
completing the browsing turn**, and the ad slot lives on that turn.

There was then a **partial recovery on 2026-09-01/02**: `web_search_triggered` and
`search_sources` came back to ~97% of runs. `web_search_query`, `model` and `ads` did not, and
have not since.

### Collateral damage: the Query Fan-Out page is effectively blank

This is the more urgent half of the incident, and it is worse than "degraded".

**Nothing in our code is broken.** The chain, end to end:

1. BrightData stopped populating `web_search_query`. Through 2026-08-24 it was an array
   (`["Speakeasy Delhi reviews cocktails"]`); since 2026-08-25 it is `null`.
2. `extractWebQueries()` reads `web_search_query`, then falls back to
   `metadata.search_model_queries` / `search_model_queries`. BrightData exposes no `metadata`,
   so both miss and it returns `[]`.
3. `reportedWebQueries([], { webSearch: true, searchProven: citations.length > 0 })` stores the
   `unavailable` sentinel rather than an empty array, because citations prove a search ran.
   That is the designed behaviour for "searched, but would not say what".
4. At read time `genuineFanoutWq()` filters `unavailable` out in SQL, so those runs contribute
   no rows.
5. The page renders its KPI row plus *"No web queries in this period — the engines you track
   didn't expose any searches for these prompts and filters."*

Every layer is behaving correctly and reporting the gap honestly. The data is simply not
arriving.

**The scale is the problem: ChatGPT was the only model producing fan-out at all.** Across the
cloud dataset, every other tracked model contributes zero genuine fan-out both before and after
the cliff — Claude, Gemini, Google AI Mode, Google AI Overview, Perplexity and Copilot all
report nothing, by design or by provider.

| Model | Aug 1–24 runs | with fan-out | Sept 1+ runs | with fan-out |
|---|---|---|---|---|
| **chatgpt** | 3,245 | **1,895 (58%)** | 5,054 | **58 (1.1%)** |
| claude | 3,128 | 0 | 4,410 | 0 |
| google-ai-mode | 3,104 | 0 | 1,902 | 0 |
| google-ai-overview | 3,105 | 0 | 4,438 | 0 |
| gemini | 10 | 0 | 2,550 | 0 |
| perplexity | 9 | 0 | 10 | 0 |

So the page is not partially degraded — for every cloud brand it now shows the empty state.
ChatGPT was carrying it alone and dropped to ~1%.

**It is not BrightData-specific either.** DataForSEO's ChatGPT scraper returns
`fan_out_queries: null` on a live probe too, a field we already read correctly. Two independent
vendors driving chatgpt.com lost the same thing on the same schedule, which points at a ChatGPT
UI change around 2026-08-25 that both DOM-reading scrapers stopped matching.

### Ruling out our own changes

- The last change to `packages/lib/src/providers/registry/brightdata.ts` before the cliff was
  **#637 on 2026-08-26** — a day *after* ads stopped, so it cannot be the cause. It is also a
  pure refactor: the diff extracts `triggerSnapshot` and swaps a local `extractSources` for the
  shared `extractCitationsFromBrightdata`. The trigger body is byte-identical, and the
  `{ answer_html, response_raw, answer_section_html, ...trimmed }` strip is untouched.
- No change to `SCRAPE_TARGETS`, the dataset id, or the `web_search` flag in that window.
- `ads` is passed through in `rawOutput` untouched; there is no code path of ours that could
  null it.

### Ads are alive and well — ~51% of US replies

This is the part I had wrong when I first called it "ads stopped". Independent trackers put
ChatGPT ad penetration at **51% of US replies** as of July 2026 and holding, with Canada ~54%,
Australia ~50%, Japan ~19% and the UK ~1.5%; Otterly measures 76.4% on shopping-intent
queries. OpenAI reported ChatGPT Ads passing a $1B annualized run rate and opened self-serve
buying in India, Europe and MENA around 2026-08-31.

So a tracked prompt set that returns **zero** ads across ~5,000 runs is a capture failure on
our side of the wire, not the market disappearing.

Two caveats that do matter, from Cloro's penetration study: the rate is genuinely volatile
(26.5% in late May → **0.05%** → ~51% by July — "still visibly tuning"), and it is an
English-speaking-market product, "roughly zero" outside a handful of countries. A page built on
this needs to survive both, which is what §3.1's empty states are for.

### What it actually takes to be served an ad

From a public XHR-level breakdown of the pipeline, ads ride **the conversation SSE stream
itself** — a `"type": "ads"` event emitted at the end of `/backend-anon/f/conversation`, after
the text tokens and product entities. The unit is `single_advertiser_ad_unit` with
`advertiser_brand`, `carousel_cards[]`, `ads_request_id`, and a `target.value` carrying
`utm_source=chatgpt&utm_medium=cpc`; assets come from `bzrcdn.openai.com`. A
`multi_advertiser_ad_unit` type exists in their code but is not yet observed in the wild. That
matches BrightData's `ads` object field-for-field, so both are reading the same unit.

Eligibility is narrow, and it is the likely mechanism here:

- **Free / Go tiers and unauthenticated sessions only.** The endpoint is literally
  `/backend-anon/`, and anonymous sessions carry `persona: "chatgpt-noauth"`. Plus, Pro and
  Business users are never served ads — nor are accounts predicted to be underage.
- **US and a handful of English-speaking markets.** Cloro's docs call `country` "required for
  accurate ad detection".

A scraper that drifts into an authenticated session, a paid tier, or a non-US exit returns a
perfectly valid answer with no ads, forever, and nothing in the payload says why. That is
exactly what we are looking at.

It also explains the Oxylabs result: its SSE stream had no ad event, but that session's
`reasoning_titles` came back in Romanian — a non-US exit, so not ad-eligible. Oxylabs may or
may not surface ads from an ad-eligible session; we cannot tell from the one sample, and it
exposes no ads field to put them in regardless.

### Tested: pinning `country: "US"` on BrightData does not bring ads back

Geo was the most plausible single fix — ads are a US/English-market product and our trigger has
never pinned a country. It is not one. `country` *is* a supported dataset input (BrightData
publishes a [ChatGPT country list](https://github.com/brightdata/answer-engines-country-codes/blob/main/chatgpt_countries.csv)),
and it is accepted and echoed back; it just changes nothing that matters.

Eight high-commercial-intent prompts, all with `country: "US"`, run 2026-09-16:

| prompt | country | model | searched | `web_search_query` | sources | shopping | ads |
|---|---|---|---|---|---|---|---|
| best project management software for remote teams | US | null | true | null | 3 | 0 | **no** |
| best noise cancelling headphones | US | null | true | null | 4 | 3 | **no** |
| best running shoes for beginners | US | null | true | null | 4 | 6 | **no** |
| best mattress for back pain | US | null | true | null | 3 | 4 | **no** |
| best travel credit card | US | null | true | null | 4 | 0 | **no** |
| best web hosting for a small ecommerce store | US | null | true | null | 4 | 0 | **no** |
| best crm for small business | US | null | true | null | 5 | 0 | **no** |
| cheapest car insurance quotes | US | null | true | null | 5 | 0 | **no** |

**0 of 8.** Against the ~51% US penetration trackers report, that is p ≈ 0.004 — not a sampling
accident. Three of the eight rendered a shopping carousel, so the collector reached the
monetizable part of the answer and still returned no ad. `model` and `web_search_query` stayed
null on all eight: the same regression, unmoved by geo.

Send `country: "US"` anyway. One field, does not fix this, but today the exit country is
whatever BrightData picks — and that is a variable worth removing now that ads serve in more
markets.

### Provider support for ChatGPT ads

| Provider | Ads field | Status | Notes |
|---|---|---|---|
| **Cloro** | **yes — opt-in `include.ads`** | **untested; not configured** | Sells this as a product ("ChatGPT Ads API"). Already pins `country: "US"`. |
| BrightData | **yes — a declared output field** | null since 2026-08-25 | No flag requests it; one dataset, one collection mode, no alternative |
| DataForSEO | none | — | `item_types` are text / products / table only |
| Oxylabs | none | — | No ads field; SSE stream had no ad event on a non-US session |
| Olostep | unknown | not configured | `@olostep/chatgpt-results`; no public field list found |

### There is no second door on BrightData

Queried from their own catalog (`GET /datasets/v3/scrapers`, which returns full input and
output schemas for all 1,078 scrapers on the account):

- `gd_m7aof0k82r803d5bjm` ("ChatGPT Search", category **AI Search**) declares **29 output
  fields, and `ads` is one of them** — alongside `model` ("Model used for answer") and
  `web_search_query` ("Model-generated web search queries (exact strings, in execution
  order)"). All three are declared; all three are now always null. That is a contract
  violation, not a courtesy field quietly retired.
- Its **complete** input schema is `url`, `prompt`, `country`, `index`, `require_sources`,
  `additional_prompt`, `web_search`, `geolocation`. Nothing requests ads, selects output
  fields, or switches ad surface.
- Its only `scraper_type` is `collect_by_url`. No alternative collection mode.
- Across all 1,078 scrapers, **exactly two declare an ads field**: ChatGPT Search and Google AI
  Mode Search — the two we already run. There is no separate ChatGPT-ads dataset or product.

So on BrightData, the way to get ads is the field we are already reading. The remaining
possibilities are the four input variants (`web_search` off/omitted, `require_sources`,
`geolocation`), tested separately, or their Browser API / Web Unlocker, where we would drive
chatgpt.com ourselves and read the `type: "ads"` event off the SSE stream — a different
integration, not a flag.

### Is there a flag we should be sending? Yes — on Cloro

Cloro's ChatGPT endpoint takes an `include` object, and **`include.ads` ("Return sponsored
blocks") is one of its flags**. Our `cloro.ts` already builds exactly that object and asks for
two of the six:

```ts
chatgpt: { taskType: "CHATGPT", field: "prompt", include: { markdown: true, searchQueries: true } },
```

`ads` and `shopping` are both available and both omitted. Adding `ads: true` is a one-line
change, and the response shape (`brand { name, url, favicon }` + `cards[] { title, body, url,
image }`) maps onto the `ad_impressions` schema in §2.1 with no rework.

Cloro is also the only provider that fixes **both** problems at once: `include.searchQueries`
is already on, so a ChatGPT target on Cloro restores query fan-out as well as ads.

**And the extra data is free.** Cloro's credit table charges ChatGPT at 5 credits with
*"any combination of raw response, query fan-out, ads, and shopping | +2 credits"* — one
surcharge for the group, not per flag. We already send `searchQueries`, so we are already
paying the +2 and running at 7 credits. Adding `ads: true` (and `shopping: true`) costs
**nothing extra**. At Hobby pricing ($0.40 per 1k credits) that is $0.0028 per run either way,
against the $0.01 per run our internal estimate carries for both BrightData and Cloro today.

On BrightData there is no such flag. The full accepted input set — confirmed by the `input`
object it echoes back — is `url`, `prompt`, `country`, `index`, `web_search`,
`additional_prompt`, `geolocation`, plus an undocumented `require_sources`. Nothing selects
output fields, and `ads` is not in their documented response either. The only knob that touches
ad eligibility is `country`, **which we have never sent in production**.

### So: has anyone else noticed?

Yes, and more than noticed — Cloro ships ChatGPT ad monitoring as a product, with a penetration
study and a technical guide. Otterly publishes an ads study. There is a public XHR breakdown of
the ad pipeline. What nobody has written up is BrightData's ChatGPT collector losing
`model`, `web_search_query` and `ads` on 2026-08-25, because the field was never documented and
BrightData published no release notes for August or September.

### Conclusion and what to do

Ads are serving at ~51% of US replies; our zero is a capture failure, and the browsing-turn
field loss on 2026-08-25 is a real vendor regression. Neither is an OpenAI policy change and
neither is ours. In priority order:

1. **Evaluate Cloro for the ChatGPT target.** It is the only provider that supports ads
   deliberately (`include.ads`), turning it on also restores query fan-out, and the flag is
   free because we already pay the +2 surcharge for `searchQueries`. Needs a `CLORO_API_KEY` —
   their free tier is 500 credits/month, which at 7 credits a run is ~70 probes, plenty to
   answer "do ads come back" in an afternoon. Highest-value next step by a wide margin.
2. **Send `country: "US"` on the BrightData ChatGPT trigger.** Tested, and it does *not* bring
   ads back (§5) — but today the exit country is whatever BrightData picks, which is a variable
   worth removing from every other question here. One field.
3. **Report the regression** to BrightData, and to DataForSEO for the fan-out half:

   > Dataset `gd_m7aof0k82r803d5bjm` returned `web_search_query`, `model`, `ads` and
   > `search_sources` on ~50% of runs through 2026-08-24. From 2026-08-25 all five
   > browsing-turn fields dropped to near zero. `search_sources` and `web_search_triggered`
   > recovered on 2026-09-01; `web_search_query`, `model` and `ads` have not. Reproduced
   > 2026-09-16 across eight high-commercial-intent prompts pinned to `country: "US"` — zero
   > ads on all eight, three of which rendered a shopping carousel. `ads`, `model` and
   > `web_search_query` are all declared output fields of this dataset per your own
   > `/datasets/v3/scrapers` catalog, and all three are now always null.

   Ask directly whether `ads` is supported going forward. The catalog still declares it, so
   "we removed it" would be a schema change they have not made — worth pinning down before
   building on the field either way.

The thing this changes about the plan: **`AD_CAPABLE_MODELS` is not the whole eligibility
story.** A surface can be ad-capable and still never show one because of who the scraper looks
like — free vs. paid, logged out vs. in, US vs. not. That is unobservable from the payload, and
it is the strongest argument for the gone-quiet warning in §3.1 being a first-class part of the
page rather than a nicety.

---

## 6. Sequencing

1. **PR #711 lands.** Ads inherits its backfill, its versioning and its read-path facade.
2. **Ads schema + extraction + worker write** (§2.1–2.4), `EXTRACTOR_VERSION` bump. Dark: no
   page yet, history fills in the background.
3. **Read path and page** (§2.6, §4) — the components in this PR, wired to a real
   `server/ads.ts`.
4. **Follow-ups:** `paid-vs-earned` placement, the prompt-detail Ads tab, `/api/v1` endpoints
   and OpenAPI, the user-guide page, `rollup_ad_advertisers` if volume warrants it, Google AI
   Overview `bottom_ads`.

Independent of all of the above, and more urgent than any of it (§5):

1. **Trial Cloro on the ChatGPT target** (§5). It is the only provider that supports ads on
   purpose, via `include.ads`, and its `include.searchQueries` — which our provider already
   sends — restores query fan-out at the same time. One flag, both problems.
2. **Restore query fan-out now** even if Cloro does not pan out: Oxylabs still returns
   `search_queries`, our extractor already reads it, and it needs only credentials in the cloud
   environment. Live user-visible bug, fix already written.
3. **Send `country: "US"` on the BrightData ChatGPT trigger**, so the exit country stops being
   whatever the vendor picks.
4. **Report the regression** to BrightData and DataForSEO.
