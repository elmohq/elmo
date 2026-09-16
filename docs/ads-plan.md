# Ads page — plan (issue #168, "chatgpt ads tracking")

## TL;DR

**Yes, we already collect the data — it's retroactive back to 2026-05-11.** BrightData's
ChatGPT scraper returns an `ads` object on every run and we persist it verbatim in
`prompt_runs.raw_output` (the provider explicitly keeps "all structured data (shopping,
recommendations, citations, etc.)" and only strips HTML). Nothing needs to change in the
scrape pipeline to have history.

**ChatGPT ads stopped on 2026-08-25 and the data is not recoverable from anywhere else.**
Between 2026-05-11 and 2026-08-24 we captured 5,900+ ad impressions across 400+ advertisers.
It is a BrightData collector regression: on one day, every field that only exists when their
collector completes a real browsing turn — `web_search_triggered`, `search_sources`,
`web_search_query`, `model` and `ads` — dropped to near zero together, while `citations` kept
working. Nothing changed on our side, and OpenAI expanded ads rather than pulling them. **The
same regression has had ChatGPT query fan-out showing "unavailable" for three weeks** — a live
user-visible bug nobody had noticed, broken on the vendor side rather than ours, and fixable
today by moving the ChatGPT target to Oxylabs, which still carries the queries. Evidence,
probes and the support ticket are in §5.

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

Every ChatGPT run's `raw_output` carries an `ads` key — undocumented by BrightData, which
matters (§5). When no ad ran it is `{"carousel_cards": null}`. When an ad ran:

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

### 3.1 The three empty states

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

### Collateral damage: ChatGPT query fan-out has been broken since the same day

Worth pulling out, because it is a live user-visible regression nobody had noticed:

| Week | ChatGPT runs | runs with a real reported web query |
|---|---|---|
| 2026-08-10 | 1,383 | 971 (70%) |
| 2026-08-17 | 1,611 | 843 (52%) |
| 2026-08-24 | 1,608 | **103 (6%)** |
| 2026-08-31 | 2,012 | 25 (1%) |
| 2026-09-14 | 968 | 10 (1%) |

The Query Fan-Out page has answered `unavailable` for essentially every ChatGPT run since
2026-08-25.

**It is broken on the vendor side, not ours**, and that is settled rather than assumed:

- August payloads carried `web_search_query` as a populated array under **the same field name
  we read** (e.g. `["Speakeasy Delhi reviews cocktails"]`). Today it is `null`.
- Nothing replaced it. A live probe has no query anywhere in the payload: not in
  `search_sources` (whose entries are `url` / `title` / `snippet` / `rank` /
  `date_published`), and not in the 770 KB of `answer_html` — zero "Searched for" chips, zero
  `search_model_queries`.
- Our extractor reads the right fields and already has the fallback (`web_search_query`, then
  `metadata.search_model_queries`), and it degrades honestly: `reportedWebQueries` writes the
  `unavailable` sentinel rather than reporting an empty fan-out, because citations prove a
  search ran. The page is telling the truth about a gap it cannot fill.

**It is also not BrightData-specific.** DataForSEO's ChatGPT LLM Scraper returns
`fan_out_queries: null` on a live probe too — a field we already read correctly. Two
independent vendors driving chatgpt.com lost the same thing on the same schedule, which points
at a ChatGPT UI change around 2026-08-25 that both DOM-reading scrapers stopped matching,
rather than one vendor's bug.

### Query fan-out is recoverable today: Oxylabs still has it

Oxylabs reads ChatGPT's **SSE conversation stream** rather than the rendered DOM, and the data
is still there:

```
"metadata": { "search_model_queries": { "queries": ["best noise cancelling headphones 2026 …"] },
              "resolved_model_slug": "gpt-5-6" }
```

A live Oxylabs run on 2026-09-16 returned `search_queries` populated and
`llm_model: "gpt-5-6"` — both of the things BrightData lost. Our Oxylabs extractor already
reads `search_queries` (`OXYLABS_QUERY_KEYS`), so **moving the ChatGPT target to Oxylabs
restores query fan-out with no code change** — it needs `OXYLABS_USERNAME` / `OXYLABS_PASSWORD`
in the cloud environment, which are currently only set for demo.

This also explains the shape of the outage: `resolved_model_slug` is alive in the stream while
BrightData reports `model: null`, so what broke is DOM chrome, not the underlying answer.

**Ads do not come back this way.** The SSE stream carries no ad markers at all — no `tessera`
image host, no `sponsored` — which fits ads being delivered by a separate call rather than in
the conversation stream. Oxylabs fixes fan-out; it does not fix ads.

### Ruling out our own changes

- The last change to `packages/lib/src/providers/registry/brightdata.ts` before the cliff was
  **#637 on 2026-08-26** — a day *after* ads stopped, so it cannot be the cause. It is also a
  pure refactor: the diff extracts `triggerSnapshot` and swaps a local `extractSources` for the
  shared `extractCitationsFromBrightdata`. The trigger body is byte-identical, and the
  `{ answer_html, response_raw, answer_section_html, ...trimmed }` strip is untouched.
- No change to `SCRAPE_TARGETS`, the dataset id, or the `web_search` flag in that window.
- `ads` is passed through in `rawOutput` untouched; there is no code path of ours that could
  null it.

### Ruling out OpenAI having pulled ads

The opposite happened. OpenAI reported ChatGPT Ads passing a $1B annualized run rate in under
200 days and opened self-serve buying in India, Europe, the Middle East and North Africa
around 2026-08-31 — within days of our data going quiet. Ads also remained visible on Google
AI Mode throughout, including from advertisers we track.

### Ruling out geo

ChatGPT ads were US-only for most of 2026, and our trigger never pinned a country, so this
looked like the likely mechanism. It is not. `country` *is* a supported input on the dataset
(BrightData publishes a [ChatGPT country list](https://github.com/brightdata/answer-engines-country-codes/blob/main/chatgpt_countries.csv))
and we have never sent it. A probe with `country: "US"` on 2026-09-16 was accepted and echoed
back, and `search_sources` came back populated — but `model`, `web_search_query` and `ads` were
all still null. Geo is not what broke.

We should start sending `country: "US"` regardless: it makes the sample deterministic instead
of leaving the exit country to BrightData, and now that ads are live in more markets, country
becomes a dimension worth controlling rather than ignoring.

### No changelog, because the field was never documented

BrightData's [release notes](https://docs.brightdata.com/release-notes) carry nothing for
August or September 2026 — the most recent entry is 2026-06-14. Their
[ChatGPT scraper docs](https://docs.brightdata.com/products/scrapers/chatgpt/introduction)
do not document an `ads` or `carousel_cards` field at all; it is an undocumented field that
happened to be populated. Worse, their current sample response (dated 2026-09-06) shows
`"model": null` — so the degraded shape has been shipped as the documented normal.

That means we have no contractual claim on `ads`, and no announcement to point at. It also
means the regression is unlikely to be fixed unless someone reports it.

### Conclusion and the ask

Ads are a BrightData collector regression; the fan-out half is broader than BrightData and
recoverable today. Neither is an OpenAI policy change, and neither is ours. The support ticket
writes itself:

> Dataset `gd_m7aof0k82r803d5bjm` returned `web_search_query`, `model`, `ads` and
> `search_sources` on ~50% of runs through 2026-08-24. From 2026-08-25 all five browsing-turn
> fields dropped to near zero. `search_sources` and `web_search_triggered` recovered on
> 2026-09-01; `web_search_query`, `model` and `ads` have not. Reproduced on 2026-09-16 with and
> without `country: "US"`. Same prompts, same dataset, no change on our side.

Worth asking them directly whether `ads` is a supported field going forward, since it is
undocumented — if it is not, ChatGPT ad tracking depends on a field they may drop again
without notice, and that belongs in the decision about how much to build on it.

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

1. **Restore ChatGPT query fan-out** by moving the ChatGPT target to Oxylabs, which still
   returns `search_queries`. No code change; it needs Oxylabs credentials in the cloud
   environment. This is a live user-visible bug and the fix is already written.
2. **Raise the regression with BrightData** — and with DataForSEO, since both lost the same
   fields.
3. **Send `country: "US"` on the ChatGPT trigger.** It does not fix any of this, but it makes
   the sample deterministic instead of leaving the exit country to the vendor, and country is a
   dimension worth controlling now that ads serve in more markets.
