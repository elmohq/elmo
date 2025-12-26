# LLM Response Data Migration to ClickHouse via Tinybird

## Executive Summary

This document outlines the plan to migrate LLM response analytics data from PostgreSQL to ClickHouse using Tinybird, enabling exceptionally fast analytics and flexible new use cases.

**Goals:**
- Sub-second analytics queries at any scale
- Real-time data ingestion for immediate insights
- Flexible schema for future analytics use cases
- Reduced load on primary PostgreSQL database
- **Full-text search on LLM response contents** for content analysis and discovery

---

## Migration Phases Overview

The migration follows a phased approach to ensure zero data loss and validate correctness before cutover.

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Dual-write new data to Tinybird | ⬜ Not Started |
| **Phase 2** | Backfill historical data | ⬜ Not Started |
| **Phase 3** | Add admin migration dashboard | ⬜ Not Started |
| **Phase 4** | Dual-read with verification | ⬜ Not Started |
| **Phase 5** | Cutover to Tinybird-only | ⬜ Not Started |
| **Phase 6** | Cleanup migration infrastructure | ⬜ Not Started |

---

## Phase 1: Dual-Write Setup

**Goal:** Start writing all new incremental data to Tinybird while continuing to write to PostgreSQL.

### Checklist

- [ ] **1.1** Create Tinybird account and workspace
- [ ] **1.2** Add environment variables (`TINYBIRD_TOKEN`, `TINYBIRD_BASE_URL`)
- [ ] **1.3** Install Tinybird client library (`@chronark/zod-bird`)
- [ ] **1.4** Create Tinybird data sources (schemas):
  - [ ] `prompt_runs` - Core events table
  - [ ] `citations` - Pre-extracted citations
  - [ ] `raw_outputs` - Full JSON archive (optional)
- [ ] **1.5** Create Tinybird materialized views:
  - [ ] `daily_visibility_mv` - Daily aggregates
  - [ ] `daily_citations_mv` - Citation aggregates
- [ ] **1.6** Create `src/lib/tinybird.ts` client module with ingestion functions
- [ ] **1.7** Modify `src/worker/worker.ts` to dual-write:
  - [ ] Add Tinybird ingestion after `savePromptRun()`
  - [ ] Handle Tinybird errors gracefully (log but don't fail the job)
- [ ] **1.8** Deploy and verify new data is flowing to Tinybird
- [ ] **1.9** Monitor ingestion for 24-48 hours to ensure stability

### Notes
- PostgreSQL remains the source of truth during this phase
- Tinybird failures should not block PostgreSQL writes
- Use a feature flag `TINYBIRD_WRITE_ENABLED` to control ingestion

---

## Phase 2: Historical Backfill

**Goal:** Backfill all historical data from PostgreSQL to Tinybird so there are no gaps.

### Prerequisites
- Phase 1 must be complete (new data flowing to Tinybird)

### Checklist

- [ ] **2.1** Create `scripts/backfill-tinybird.ts` script
- [ ] **2.2** Add progress tracking (Redis or database) to support resumable backfill
- [ ] **2.3** Test backfill on a small subset (e.g., 1 brand, last 30 days)
- [ ] **2.4** Run full historical backfill:
  - [ ] Process in batches of 1000 rows
  - [ ] Rate limit to avoid overwhelming Tinybird API
  - [ ] Log progress every 10,000 rows
- [ ] **2.5** Verify row counts match between PostgreSQL and Tinybird
- [ ] **2.6** Verify data integrity:
  - [ ] Spot check 10 random prompt_runs match
  - [ ] Verify citation counts match for 5 random brands
  - [ ] Verify daily aggregates match for sample date range

### Backfill Script Considerations
- Handle the `created_at` timestamp carefully (use original, not backfill time)
- Extract `text_content` from `raw_output` using existing extraction logic
- Include prompt `tags` and `systemTags` in the denormalized data

---

## Phase 3: Admin Migration Dashboard

**Goal:** Create an `/admin/tinybird` page that shows query performance comparisons and migration status.

### Checklist

- [ ] **3.1** Create Redis keys for storing query timing metrics:
  - `tinybird:timing:{endpoint}:postgres` - Array of recent PostgreSQL query times
  - `tinybird:timing:{endpoint}:tinybird` - Array of recent Tinybird query times
  - `tinybird:comparison:{endpoint}` - Recent comparison results (match/mismatch)
- [ ] **3.2** Create `src/app/admin/tinybird/page.tsx` with:
  - [ ] Migration phase status (Phase 1-6 checklist)
  - [ ] Query performance comparison table
  - [ ] Data verification results
  - [ ] Mismatch log viewer
- [ ] **3.3** Create `src/app/api/admin/tinybird/stats/route.ts` API endpoint
- [ ] **3.4** Add query timing instrumentation to dual-read endpoints
- [ ] **3.5** Add comparison result logging with debug details

### Dashboard Features

```
┌─────────────────────────────────────────────────────────────────┐
│ Tinybird Migration Status                                       │
├─────────────────────────────────────────────────────────────────┤
│ Phase 1: Dual-Write        ✅ Complete                          │
│ Phase 2: Backfill          ✅ Complete (623,451 rows)           │
│ Phase 3: Dashboard         ✅ Active                            │
│ Phase 4: Verification      🔄 In Progress (72 hrs remaining)    │
│ Phase 5: Cutover           ⬜ Pending                           │
│ Phase 6: Cleanup           ⬜ Pending                           │
├─────────────────────────────────────────────────────────────────┤
│ Query Performance (last 24h)                                    │
├─────────────────────────────────────────────────────────────────┤
│ Endpoint              │ PostgreSQL │ Tinybird │ Speedup │ Match │
│───────────────────────┼────────────┼──────────┼─────────┼───────│
│ dashboard-summary     │ 1,245ms    │ 89ms     │ 14x     │ 100%  │
│ visibility-timeseries │ 892ms      │ 45ms     │ 20x     │ 100%  │
│ prompt-chart-data     │ 456ms      │ 32ms     │ 14x     │ 99.8% │
│ citations             │ 2,103ms    │ 156ms    │ 13x     │ 100%  │
│ prompts-summary       │ 1,567ms    │ 78ms     │ 20x     │ 100%  │
├─────────────────────────────────────────────────────────────────┤
│ Recent Mismatches (2 in last 24h)                               │
├─────────────────────────────────────────────────────────────────┤
│ [View Details] prompt-chart-data @ 2024-01-15 14:23:01          │
│   - PostgreSQL: visibility=45.2%                                │
│   - Tinybird: visibility=45.1%                                  │
│   - Diff: 0.1% (within tolerance)                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Dual-Read with Verification

**Goal:** Query both PostgreSQL and Tinybird, return PostgreSQL results, but verify they match Tinybird and log discrepancies.

### Prerequisites
- Phase 2 must be complete (all data backfilled)
- Phase 3 must be complete (dashboard ready for monitoring)

### Checklist

- [ ] **4.1** Create `src/lib/tinybird-comparison.ts` with comparison utilities:
  - [ ] `compareResults()` - Deep comparison with configurable tolerance
  - [ ] `logMismatch()` - Store mismatch details in Redis for debugging
  - [ ] `recordTiming()` - Store query timing metrics
- [ ] **4.2** Create Tinybird query endpoints (pipes):
  - [ ] `dashboard_summary.pipe`
  - [ ] `visibility_timeseries.pipe`
  - [ ] `prompt_chart.pipe`
  - [ ] `citation_stats.pipe`
  - [ ] `prompts_summary.pipe`
- [ ] **4.3** Add feature flag `TINYBIRD_VERIFY_ENABLED=true`
- [ ] **4.4** Update API routes to dual-read:
  - [ ] `src/app/api/brands/[id]/dashboard-summary/route.ts`
  - [ ] `src/app/api/brands/[id]/prompts-summary/route.ts`
  - [ ] `src/app/api/brands/[id]/citations/route.ts`
  - [ ] `src/app/api/brands/[id]/prompts/[promptId]/chart-data/route.ts`
  - [ ] `src/app/api/prompts/[promptId]/stats/route.ts`
- [ ] **4.5** Run verification for minimum 7 days
- [ ] **4.6** Achieve 99.9% match rate (accounting for floating point tolerance)
- [ ] **4.7** Investigate and resolve any systematic mismatches
- [ ] **4.8** Sign off on verification results

### Dual-Read Pattern

```typescript
// src/app/api/brands/[id]/dashboard-summary/route.ts

import { verifyAndLog } from '@/lib/tinybird-comparison';

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
    const { id: brandId } = await params;
    
    // Always query PostgreSQL (source of truth)
    const startPg = performance.now();
    const postgresResult = await queryPostgres(brandId, filters);
    const pgTime = performance.now() - startPg;
    
    // Optionally verify against Tinybird
    if (process.env.TINYBIRD_VERIFY_ENABLED === 'true') {
        const startTb = performance.now();
        const tinybirdResult = await queryTinybird('dashboard_summary', { brand_id: brandId, ...filters });
        const tbTime = performance.now() - startTb;
        
        // Compare and log (async, don't block response)
        verifyAndLog({
            endpoint: 'dashboard-summary',
            brandId,
            filters,
            postgresResult,
            tinybirdResult,
            pgTime,
            tbTime,
        });
    }
    
    // Return PostgreSQL result
    return NextResponse.json(postgresResult);
}
```

### Comparison Tolerances

| Field Type | Tolerance | Notes |
|------------|-----------|-------|
| Counts (integers) | Exact | Must match exactly |
| Percentages | ±0.1% | Floating point differences |
| Timestamps | ±1 second | Clock drift |
| Arrays | Order-independent | Same elements |

### Mismatch Logging

When a mismatch is detected, log to Redis with full context for debugging:

```typescript
interface MismatchLog {
    endpoint: string;
    timestamp: string;
    brandId: string;
    filters: Record<string, any>;
    postgres: any;
    tinybird: any;
    diff: {
        field: string;
        pgValue: any;
        tbValue: any;
        withinTolerance: boolean;
    }[];
}
```

---

## Phase 5: Cutover to Tinybird

**Goal:** Switch to reading from Tinybird only, stop writing to PostgreSQL analytics tables.

### Prerequisites
- Phase 4 verification must be complete with 99.9%+ match rate
- No unresolved systematic mismatches
- Team sign-off on cutover

### Checklist

- [ ] **5.1** Add feature flag `TINYBIRD_READ_PRIMARY=true`
- [ ] **5.2** Update all API routes to read from Tinybird as primary source
- [ ] **5.3** Keep PostgreSQL write for 7-day safety buffer
- [ ] **5.4** Monitor error rates and latencies post-cutover
- [ ] **5.5** After 7 days stable, disable PostgreSQL analytics writes
- [ ] **5.6** Document rollback procedure (re-enable `TINYBIRD_READ_PRIMARY=false`)

### Cutover Order

1. **Low-risk endpoints first:**
   - `prompts-summary` (read-heavy, well-tested)
   - `visibility-timeseries` (simple aggregation)
   
2. **Medium-risk endpoints:**
   - `dashboard-summary`
   - `prompt-chart-data`
   
3. **High-risk endpoints last:**
   - `citations` (complex JSON extraction)

---

## Phase 6: Cleanup Migration Infrastructure

**Goal:** Remove dual-write/dual-read code and migration dashboard.

### Prerequisites
- Phase 5 must be stable for 30+ days
- No rollbacks needed

### Checklist

- [ ] **6.1** Remove PostgreSQL analytics write code from worker
- [ ] **6.2** Remove dual-read comparison code from API routes
- [ ] **6.3** Remove `src/lib/tinybird-comparison.ts`
- [ ] **6.4** Remove `/admin/tinybird` migration page
- [ ] **6.5** Clean up Redis migration metrics keys
- [ ] **6.6** Remove feature flags:
  - `TINYBIRD_WRITE_ENABLED`
  - `TINYBIRD_VERIFY_ENABLED`
  - `TINYBIRD_READ_PRIMARY`
- [ ] **6.7** Update documentation
- [ ] **6.8** Consider archiving or dropping `prompt_runs` from PostgreSQL (keep schema)

---

## Current State Analysis

### Existing Data Model (PostgreSQL)

The `prompt_runs` table stores LLM response data:

```sql
prompt_runs (
  id: uuid PRIMARY KEY,
  prompt_id: uuid REFERENCES prompts(id),
  model_group: enum('openai', 'anthropic', 'google'),
  model: text,
  web_search_enabled: boolean,
  raw_output: json,          -- Large JSON blob (5-50KB per row)
  web_queries: text[],       -- Array of search queries used
  brand_mentioned: boolean,
  competitors_mentioned: text[],
  created_at: timestamptz
)
```

**Related tables:**
- `prompts` → `brands` (via `brand_id`)
- `prompts.tags` - User-defined tags (array of lowercase strings)
- `prompts.systemTags` - Auto-computed tags (e.g., "branded", "unbranded")
- `competitors` (by `brand_id`)

### Current Query Patterns

1. **Visibility Time Series** - Daily/rolling average of brand mentions across prompts
2. **Citation Analytics** - Extract URLs from nested `raw_output` JSON (OpenAI/Google formats)
3. **Dashboard Aggregations** - Counts, percentages, grouped by date/model/brand
4. **Prompt-Level Charts** - Per-prompt visibility trends over time
5. **Tag Filtering** - Filter prompts by user tags or system tags (branded/unbranded)
6. **Prompt Text Search** - Client-side search on prompt value (text)

### Missing Capabilities

- **Full-text search** on LLM response content (e.g., "find all responses mentioning 'pricing'")
- **Semantic analysis** of what LLMs are saying about brands
- **Content discovery** across all responses

### Pain Points

1. **Complex JSON Extraction** - Heavy CTEs to parse nested `raw_output` for citations
2. **Large Data Transfer** - `raw_output` is excluded from many queries to improve performance
3. **Aggregation Cost** - Rolling averages and time-series require expensive GROUP BY operations
4. **No Real-time** - Analytics lag behind data ingestion
5. **No Full-Text Search** - Cannot search response content without extracting and indexing separately

---

## Proposed Tinybird Architecture

### Data Source Design

#### 1. `prompt_runs` (Core Events)

Flattened event stream optimized for analytics queries. Includes denormalized prompt metadata for fast filtering.

```sql
-- Tinybird Data Source: prompt_runs
SCHEMA >
    id String,
    prompt_id String,
    brand_id String,
    brand_name String,           -- Denormalized for fast filtering
    prompt_value String,         -- Denormalized for analysis
    prompt_group_category Nullable(String),
    prompt_group_prefix Nullable(String),
    prompt_tags Array(String),   -- User-defined tags (denormalized from prompts.tags)
    prompt_system_tags Array(String), -- System tags (denormalized from prompts.systemTags)
    model_group LowCardinality(String),  -- 'openai', 'anthropic', 'google'
    model LowCardinality(String),
    web_search_enabled UInt8,    -- Boolean as 0/1
    brand_mentioned UInt8,       -- Boolean as 0/1
    competitors_mentioned Array(String),
    web_queries Array(String),
    text_content String,         -- Pre-extracted text (avoid JSON parsing)
    created_at DateTime64(3, 'UTC'),
    -- Derived fields for faster queries
    competitor_count UInt16,
    has_competitor_mention UInt8,
    run_date Date,               -- Materialized for partition/aggregation
    -- Full-text search index (tokenized for fast text search)
    INDEX text_content_idx text_content TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4

ENGINE "MergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(run_date)"
ENGINE_SORTING_KEY "brand_id, prompt_id, run_date, created_at"
```

> **Full-Text Search Note**: The `tokenbf_v1` index is a token bloom filter that enables fast 
> full-text search on `text_content`. This allows efficient queries like "find all responses 
> mentioning 'pricing'" without scanning every row.

> **Tags Note**: Prompt tags are denormalized into each prompt_run event. If tags are updated
> on a prompt, historical runs will retain their original tags. This is intentional - analytics
> should reflect the tags at the time of the run. For current tag state, query PostgreSQL.

#### 2. `citations` (Extracted from raw_output)

Pre-extracted citations for fast citation analytics.

```sql
-- Tinybird Data Source: citations
SCHEMA >
    prompt_run_id String,
    prompt_id String,                 -- For prompt-level citation analytics
    brand_id String,
    model_group LowCardinality(String),
    url String,
    domain LowCardinality(String),
    title Nullable(String),
    category LowCardinality(String),  -- 'brand', 'competitor', 'social_media', 'other'
    created_at DateTime64(3, 'UTC'),
    run_date Date

ENGINE "MergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(run_date)"
ENGINE_SORTING_KEY "brand_id, prompt_id, domain, run_date"
```

#### 3. `raw_outputs` (Archive/Deep Analysis)

Store full raw outputs separately for deep analysis when needed.

```sql
-- Tinybird Data Source: raw_outputs
SCHEMA >
    prompt_run_id String,
    brand_id String,
    model_group LowCardinality(String),
    raw_output String,  -- JSON as string (compressed well by ClickHouse)
    created_at DateTime64(3, 'UTC')

ENGINE "MergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(toDate(created_at))"
ENGINE_SORTING_KEY "brand_id, created_at"
ENGINE_TTL "created_at + INTERVAL 90 DAY"  -- Optional: auto-expire old data
```

### Materialized Views (Pre-Aggregations)

#### Daily Visibility Aggregates

```sql
-- Tinybird Materialized View: daily_visibility_mv
SCHEMA >
    brand_id String,
    prompt_id String,
    run_date Date,
    model_group LowCardinality(String),
    web_search_enabled UInt8,
    is_branded UInt8,            -- Does prompt contain brand name?
    total_runs UInt64,
    brand_mentioned_count UInt64,
    competitor_mentioned_count UInt64

SELECT
    brand_id,
    prompt_id,
    run_date,
    model_group,
    web_search_enabled,
    -- Check if 'branded' is in system tags
    has(prompt_system_tags, 'branded') as is_branded,
    count() as total_runs,
    sum(brand_mentioned) as brand_mentioned_count,
    sum(has_competitor_mention) as competitor_mentioned_count
FROM prompt_runs
GROUP BY brand_id, prompt_id, run_date, model_group, web_search_enabled, is_branded

ENGINE "SummingMergeTree"
ENGINE_SORTING_KEY "brand_id, run_date, model_group, web_search_enabled, prompt_id"
```

#### Daily Citation Aggregates

```sql
-- Tinybird Materialized View: daily_citations_mv
SCHEMA >
    brand_id String,
    run_date Date,
    domain LowCardinality(String),
    category LowCardinality(String),
    citation_count UInt64

SELECT
    brand_id,
    run_date,
    domain,
    category,
    count() as citation_count
FROM citations
GROUP BY brand_id, run_date, domain, category

ENGINE "SummingMergeTree"
ENGINE_SORTING_KEY "brand_id, run_date, category, domain"
```

---

## Published API Endpoints

### 1. Dashboard Summary

```sql
-- Endpoint: /v0/pipes/dashboard_summary.json
-- Parameters: brand_id, lookback (1w, 1m, 3m, 6m, 1y, all), tags (optional, comma-separated)

SELECT
    countDistinct(prompt_id) as total_prompts,
    sum(total_runs) as total_runs,
    round(sum(brand_mentioned_count) * 100.0 / sum(total_runs), 1) as avg_visibility,
    round(sumIf(brand_mentioned_count, is_branded = 0) * 100.0 / 
          sumIf(total_runs, is_branded = 0), 1) as non_branded_visibility,
    max(run_date) as last_updated
FROM daily_visibility_mv
WHERE brand_id = {{String(brand_id, '')}}
  AND run_date >= {{Date(from_date, '2024-01-01')}}
```

### 2. Visibility Time Series

```sql
-- Endpoint: /v0/pipes/visibility_timeseries.json
-- Parameters: brand_id, from_date, to_date

WITH daily AS (
    SELECT
        run_date,
        sum(total_runs) as day_runs,
        sum(brand_mentioned_count) as day_mentioned
    FROM daily_visibility_mv
    WHERE brand_id = {{String(brand_id, '')}}
      AND run_date BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
    GROUP BY run_date
)
SELECT
    run_date as date,
    round(
        sumIf(day_mentioned, 1=1) OVER w * 100.0 /
        sumIf(day_runs, 1=1) OVER w, 
        1
    ) as visibility_7d_avg
FROM daily
WINDOW w AS (ORDER BY run_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
ORDER BY run_date
```

### 3. Citation Stats

```sql
-- Endpoint: /v0/pipes/citation_stats.json
-- Parameters: brand_id, days

SELECT
    domain,
    category,
    sum(citation_count) as total_citations
FROM daily_citations_mv
WHERE brand_id = {{String(brand_id, '')}}
  AND run_date >= today() - {{Int32(days, 7)}}
GROUP BY domain, category
ORDER BY total_citations DESC
LIMIT 100
```

### 4. Prompt Chart Data

```sql
-- Endpoint: /v0/pipes/prompt_chart.json
-- Parameters: brand_id, prompt_id, from_date, to_date, model_group (optional)

SELECT
    run_date as date,
    model_group,
    sum(total_runs) as runs,
    sum(brand_mentioned_count) as brand_mentions,
    round(sum(brand_mentioned_count) * 100.0 / sum(total_runs), 1) as visibility
FROM daily_visibility_mv
WHERE brand_id = {{String(brand_id, '')}}
  AND prompt_id = {{String(prompt_id, '')}}
  AND run_date BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
  {% if defined(model_group) %}
  AND model_group = {{String(model_group)}}
  {% end %}
GROUP BY run_date, model_group
ORDER BY run_date
```

### 5. Prompts Summary with Tag Filtering

```sql
-- Endpoint: /v0/pipes/prompts_summary.json
-- Parameters: brand_id, from_date, to_date, tags (optional, comma-separated)

SELECT
    prompt_id,
    any(prompt_value) as value,
    any(prompt_group_category) as group_category,
    any(prompt_group_prefix) as group_prefix,
    arrayDistinct(arrayFlatten(groupArray(prompt_tags))) as tags,
    arrayDistinct(arrayFlatten(groupArray(prompt_system_tags))) as system_tags,
    sum(total_runs) as total_runs,
    round(sum(brand_mentioned_count) * 100.0 / sum(total_runs), 1) as brand_mention_rate,
    round(sum(competitor_mentioned_count) * 100.0 / sum(total_runs), 1) as competitor_mention_rate,
    max(run_date) as last_run_date
FROM daily_visibility_mv
WHERE brand_id = {{String(brand_id, '')}}
  AND run_date BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
  {% if defined(tags) %}
  -- Filter by tags (matches if ANY of the filter tags are present)
  AND (
    hasAny(prompt_tags, splitByChar(',', {{String(tags, '')}}))
    OR hasAny(prompt_system_tags, splitByChar(',', {{String(tags, '')}}))
  )
  {% end %}
GROUP BY prompt_id
ORDER BY total_runs DESC
```

### 6. Full-Text Search on Response Content

Search across all LLM response text for specific terms, phrases, or patterns.

```sql
-- Endpoint: /v0/pipes/content_search.json
-- Parameters: brand_id, query, from_date (optional), to_date (optional), model_group (optional)

SELECT
    id,
    prompt_id,
    prompt_value,
    model_group,
    brand_mentioned,
    text_content,
    created_at
FROM prompt_runs
WHERE brand_id = {{String(brand_id, '')}}
  -- Full-text search using token matching (uses the bloom filter index)
  AND hasTokenCaseInsensitive(text_content, {{String(query, '')}})
  {% if defined(from_date) %}
  AND run_date >= {{Date(from_date)}}
  {% end %}
  {% if defined(to_date) %}
  AND run_date <= {{Date(to_date)}}
  {% end %}
  {% if defined(model_group) %}
  AND model_group = {{String(model_group)}}
  {% end %}
ORDER BY created_at DESC
LIMIT {{Int32(limit, 100)}}
```

### 7. Multi-Term Content Search

Search for responses containing multiple terms (AND/OR logic).

```sql
-- Endpoint: /v0/pipes/content_search_multi.json
-- Parameters: brand_id, terms (comma-separated), match_all (boolean)

SELECT
    id,
    prompt_id,
    prompt_value,
    model_group,
    text_content,
    created_at,
    -- Highlight which terms matched
    multiSearchAllPositionsCaseInsensitive(text_content, splitByChar(',', {{String(terms, '')}})) as match_positions
FROM prompt_runs
WHERE brand_id = {{String(brand_id, '')}}
  {% if Boolean(match_all, true) %}
  -- All terms must match (AND)
  AND multiSearchAnyCaseInsensitive(text_content, splitByChar(',', {{String(terms, '')}})) = 1
  AND length(multiSearchAllPositionsCaseInsensitive(text_content, splitByChar(',', {{String(terms, '')}}))) 
      = length(splitByChar(',', {{String(terms, '')}}))
  {% else %}
  -- Any term can match (OR)
  AND multiSearchAnyCaseInsensitive(text_content, splitByChar(',', {{String(terms, '')}})) = 1
  {% end %}
ORDER BY created_at DESC
LIMIT {{Int32(limit, 100)}}
```

### 8. Term Frequency

Analyze how often specific terms appear across responses.

```sql
-- Endpoint: /v0/pipes/term_frequency.json
-- Parameters: brand_id, term, from_date, to_date

SELECT
    run_date as date,
    model_group,
    count() as total_responses,
    countIf(hasTokenCaseInsensitive(text_content, {{String(term, '')}})) as responses_with_term,
    round(countIf(hasTokenCaseInsensitive(text_content, {{String(term, '')}})) * 100.0 / count(), 2) as term_frequency_pct
FROM prompt_runs
WHERE brand_id = {{String(brand_id, '')}}
  AND run_date BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
GROUP BY run_date, model_group
ORDER BY run_date, model_group
```

### 9. Content Snippets

Get response snippets with context around search matches.

```sql
-- Endpoint: /v0/pipes/content_snippets.json
-- Parameters: brand_id, query, context_chars (chars before/after match)

SELECT
    id,
    prompt_value,
    model_group,
    created_at,
    -- Extract snippet with context around the match
    substring(
        text_content,
        greatest(1, positionCaseInsensitive(text_content, {{String(query, '')}}) - {{Int32(context_chars, 100)}}),
        length({{String(query, '')}}) + {{Int32(context_chars, 100)}} * 2
    ) as snippet,
    positionCaseInsensitive(text_content, {{String(query, '')}}) as match_position
FROM prompt_runs
WHERE brand_id = {{String(brand_id, '')}}
  AND hasTokenCaseInsensitive(text_content, {{String(query, '')}})
ORDER BY created_at DESC
LIMIT {{Int32(limit, 50)}}
```

---

## Full-Text Search Capabilities

### Supported Search Operations

| Operation | ClickHouse Function | Use Case |
|-----------|-------------------|----------|
| Single term | `hasTokenCaseInsensitive()` | "Find responses mentioning 'pricing'" |
| Multiple terms (OR) | `multiSearchAnyCaseInsensitive()` | "Find 'discount' OR 'sale' OR 'offer'" |
| Multiple terms (AND) | Combined with array length check | "Must mention 'quality' AND 'support'" |
| Phrase search | `positionCaseInsensitive()` | "Find exact phrase 'best in class'" |
| Fuzzy/typo-tolerant | `ngramSearch()` | "Find 'priceing' → 'pricing'" |
| Regex patterns | `match()` | "Find price patterns like '$XX.XX'" |

### Performance Considerations

1. **Bloom Filter Index**: The `tokenbf_v1` index on `text_content` enables fast filtering before full scans
2. **Partition Pruning**: Always include `run_date` filters to limit partitions scanned
3. **Column Projection**: Only select needed columns (avoid `SELECT *`)
4. **Expected Performance**: 
   - Simple term search: **50-200ms** for 600K rows
   - Multi-term search: **100-500ms** for 600K rows
   - Without index: Would be 5-10x slower

### Example: Sentiment/Topic Analysis

```sql
-- Find responses discussing pricing negatively
SELECT 
    count() as negative_pricing_mentions,
    model_group
FROM prompt_runs
WHERE brand_id = {{String(brand_id)}}
  AND hasTokenCaseInsensitive(text_content, 'expensive')
  OR hasTokenCaseInsensitive(text_content, 'overpriced')
  OR hasTokenCaseInsensitive(text_content, 'costly')
GROUP BY model_group
```

```sql
-- Find responses recommending competitors
SELECT 
    prompt_value,
    text_content,
    competitors_mentioned
FROM prompt_runs
WHERE brand_id = {{String(brand_id)}}
  AND (
    hasTokenCaseInsensitive(text_content, 'recommend')
    OR hasTokenCaseInsensitive(text_content, 'suggest')
    OR hasTokenCaseInsensitive(text_content, 'alternative')
  )
  AND has_competitor_mention = 1
LIMIT 100
```

---

## Implementation Code

### Tinybird Client Module

```typescript
// src/lib/tinybird.ts

import { z } from 'zod';

const TINYBIRD_BASE_URL = process.env.TINYBIRD_BASE_URL || 'https://api.tinybird.co';
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN!;

// Ingestion client
export async function ingestToTinybird(
    dataSource: string,
    events: Record<string, any>[]
): Promise<void> {
    if (process.env.TINYBIRD_WRITE_ENABLED !== 'true') return;
    
    const ndjson = events.map(e => JSON.stringify(e)).join('\n');
    
    const response = await fetch(
        `${TINYBIRD_BASE_URL}/v0/events?name=${dataSource}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${TINYBIRD_TOKEN}`,
                'Content-Type': 'application/x-ndjson',
            },
            body: ndjson,
        }
    );

    if (!response.ok) {
        console.error(`Tinybird ingestion failed: ${response.statusText}`);
        // Don't throw - ingestion failures shouldn't block the main flow
    }
}

// Query client
export async function queryTinybird<T>(
    pipe: string,
    params: Record<string, string | number>
): Promise<T[]> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        searchParams.set(key, String(value));
    }

    const response = await fetch(
        `${TINYBIRD_BASE_URL}/v0/pipes/${pipe}.json?${searchParams}`,
        {
            headers: {
                Authorization: `Bearer ${TINYBIRD_TOKEN}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Tinybird query failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
}
```

### Worker Integration

```typescript
// src/worker/worker.ts - Add after savePromptRun()

import { ingestToTinybird } from '@/lib/tinybird';
import { extractTextContent, extractCitations } from '@/lib/text-extraction';

interface TinybirdPromptRunEvent {
    id: string;
    prompt_id: string;
    brand_id: string;
    brand_name: string;
    prompt_value: string;
    prompt_group_category: string | null;
    prompt_group_prefix: string | null;
    prompt_tags: string[];
    prompt_system_tags: string[];
    model_group: string;
    model: string;
    web_search_enabled: number;
    brand_mentioned: number;
    competitors_mentioned: string[];
    web_queries: string[];
    text_content: string;
    created_at: string;
    competitor_count: number;
    has_competitor_mention: number;
    run_date: string;
}

async function sendToTinybird(
    promptRun: {
        id: string;
        promptId: string;
        brandId: string;
        brandName: string;
        promptValue: string;
        groupCategory: string | null;
        groupPrefix: string | null;
        tags: string[];
        systemTags: string[];
        modelGroup: string;
        model: string;
        webSearchEnabled: boolean;
        brandMentioned: boolean;
        competitorsMentioned: string[];
        webQueries: string[];
        textContent: string;
        rawOutput: any;
    }
): Promise<void> {
    const now = new Date();
    
    // Send core event
    const event: TinybirdPromptRunEvent = {
        id: promptRun.id,
        prompt_id: promptRun.promptId,
        brand_id: promptRun.brandId,
        brand_name: promptRun.brandName,
        prompt_value: promptRun.promptValue,
        prompt_group_category: promptRun.groupCategory,
        prompt_group_prefix: promptRun.groupPrefix,
        prompt_tags: promptRun.tags,
        prompt_system_tags: promptRun.systemTags,
        model_group: promptRun.modelGroup,
        model: promptRun.model,
        web_search_enabled: promptRun.webSearchEnabled ? 1 : 0,
        brand_mentioned: promptRun.brandMentioned ? 1 : 0,
        competitors_mentioned: promptRun.competitorsMentioned,
        web_queries: promptRun.webQueries,
        text_content: promptRun.textContent,
        created_at: now.toISOString(),
        competitor_count: promptRun.competitorsMentioned.length,
        has_competitor_mention: promptRun.competitorsMentioned.length > 0 ? 1 : 0,
        run_date: now.toISOString().split('T')[0],
    };
    
    await ingestToTinybird('prompt_runs', [event]);

    // Extract and send citations
    const citations = extractCitations(promptRun.rawOutput, promptRun.modelGroup);
    if (citations.length > 0) {
        await ingestToTinybird('citations', citations.map(c => ({
            prompt_run_id: promptRun.id,
            prompt_id: promptRun.promptId,
            brand_id: promptRun.brandId,
            model_group: promptRun.modelGroup,
            url: c.url,
            domain: c.domain,
            title: c.title || null,
            category: c.category || 'other',
            created_at: now.toISOString(),
            run_date: now.toISOString().split('T')[0],
        })));
    }
}
```

### Comparison Utility

```typescript
// src/lib/tinybird-comparison.ts

import { redis } from '@/lib/redis';

const TIMING_TTL = 60 * 60 * 24; // 24 hours
const MISMATCH_TTL = 60 * 60 * 24 * 7; // 7 days
const MAX_TIMING_ENTRIES = 1000;

interface ComparisonResult {
    endpoint: string;
    brandId: string;
    filters: Record<string, any>;
    postgresResult: any;
    tinybirdResult: any;
    pgTime: number;
    tbTime: number;
}

interface FieldDiff {
    field: string;
    pgValue: any;
    tbValue: any;
    withinTolerance: boolean;
}

export async function verifyAndLog(comparison: ComparisonResult): Promise<void> {
    const { endpoint, brandId, postgresResult, tinybirdResult, pgTime, tbTime } = comparison;
    
    // Record timing
    await recordTiming(endpoint, 'postgres', pgTime);
    await recordTiming(endpoint, 'tinybird', tbTime);
    
    // Compare results
    const diffs = compareResults(postgresResult, tinybirdResult);
    const isMatch = diffs.every(d => d.withinTolerance);
    
    // Record match/mismatch
    await recordComparison(endpoint, isMatch);
    
    // Log mismatch details for debugging
    if (!isMatch) {
        await logMismatch({
            endpoint,
            timestamp: new Date().toISOString(),
            brandId,
            filters: comparison.filters,
            postgres: postgresResult,
            tinybird: tinybirdResult,
            diff: diffs,
        });
    }
}

function compareResults(pg: any, tb: any, prefix = ''): FieldDiff[] {
    const diffs: FieldDiff[] = [];
    
    if (typeof pg !== typeof tb) {
        diffs.push({ field: prefix || 'root', pgValue: pg, tbValue: tb, withinTolerance: false });
        return diffs;
    }
    
    if (Array.isArray(pg) && Array.isArray(tb)) {
        // Compare arrays (order-independent for most cases)
        const pgSorted = [...pg].sort();
        const tbSorted = [...tb].sort();
        if (JSON.stringify(pgSorted) !== JSON.stringify(tbSorted)) {
            diffs.push({ field: prefix || 'array', pgValue: pg, tbValue: tb, withinTolerance: false });
        }
        return diffs;
    }
    
    if (typeof pg === 'object' && pg !== null) {
        const allKeys = new Set([...Object.keys(pg), ...Object.keys(tb)]);
        for (const key of allKeys) {
            const fieldPath = prefix ? `${prefix}.${key}` : key;
            diffs.push(...compareResults(pg[key], tb[key], fieldPath));
        }
        return diffs;
    }
    
    if (typeof pg === 'number' && typeof tb === 'number') {
        // Allow small floating point differences
        const tolerance = 0.1;
        const withinTolerance = Math.abs(pg - tb) <= tolerance;
        if (pg !== tb) {
            diffs.push({ field: prefix, pgValue: pg, tbValue: tb, withinTolerance });
        }
        return diffs;
    }
    
    if (pg !== tb) {
        diffs.push({ field: prefix, pgValue: pg, tbValue: tb, withinTolerance: false });
    }
    
    return diffs;
}

async function recordTiming(endpoint: string, source: 'postgres' | 'tinybird', time: number): Promise<void> {
    const key = `tinybird:timing:${endpoint}:${source}`;
    await redis.lpush(key, time.toString());
    await redis.ltrim(key, 0, MAX_TIMING_ENTRIES - 1);
    await redis.expire(key, TIMING_TTL);
}

async function recordComparison(endpoint: string, isMatch: boolean): Promise<void> {
    const key = `tinybird:comparison:${endpoint}`;
    await redis.lpush(key, isMatch ? '1' : '0');
    await redis.ltrim(key, 0, MAX_TIMING_ENTRIES - 1);
    await redis.expire(key, TIMING_TTL);
}

async function logMismatch(mismatch: any): Promise<void> {
    const key = `tinybird:mismatches:${mismatch.endpoint}`;
    await redis.lpush(key, JSON.stringify(mismatch));
    await redis.ltrim(key, 0, 99); // Keep last 100 mismatches per endpoint
    await redis.expire(key, MISMATCH_TTL);
}

// Stats retrieval for admin dashboard
export async function getMigrationStats(): Promise<{
    endpoints: {
        name: string;
        pgP50: number;
        pgP95: number;
        tbP50: number;
        tbP95: number;
        matchRate: number;
    }[];
    recentMismatches: any[];
}> {
    const endpoints = ['dashboard-summary', 'visibility-timeseries', 'prompt-chart-data', 'citations', 'prompts-summary'];
    const stats = [];
    
    for (const endpoint of endpoints) {
        const pgTimes = (await redis.lrange(`tinybird:timing:${endpoint}:postgres`, 0, -1)).map(Number);
        const tbTimes = (await redis.lrange(`tinybird:timing:${endpoint}:tinybird`, 0, -1)).map(Number);
        const comparisons = (await redis.lrange(`tinybird:comparison:${endpoint}`, 0, -1)).map(Number);
        
        stats.push({
            name: endpoint,
            pgP50: percentile(pgTimes, 50),
            pgP95: percentile(pgTimes, 95),
            tbP50: percentile(tbTimes, 50),
            tbP95: percentile(tbTimes, 95),
            matchRate: comparisons.length > 0 
                ? (comparisons.filter(c => c === 1).length / comparisons.length) * 100 
                : 100,
        });
    }
    
    // Get recent mismatches
    const recentMismatches = [];
    for (const endpoint of endpoints) {
        const mismatches = await redis.lrange(`tinybird:mismatches:${endpoint}`, 0, 4);
        recentMismatches.push(...mismatches.map(m => JSON.parse(m)));
    }
    
    return { endpoints: stats, recentMismatches: recentMismatches.slice(0, 10) };
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}
```

### Backfill Script

```typescript
// scripts/backfill-tinybird.ts

import { db } from '../src/lib/db/db';
import { promptRuns, prompts, brands } from '../src/lib/db/schema';
import { eq, gt, sql } from 'drizzle-orm';
import { ingestToTinybird } from '../src/lib/tinybird';
import { extractTextContent, extractCitations } from '../src/lib/text-extraction';
import { redis } from '../src/lib/redis';

const BATCH_SIZE = 1000;
const PROGRESS_KEY = 'tinybird:backfill:last_id';

async function backfillPromptRuns() {
    // Resume from last position if interrupted
    let lastId = await redis.get(PROGRESS_KEY) || '';
    let totalProcessed = 0;
    let hasMore = true;

    console.log(`Starting backfill from: ${lastId || 'beginning'}`);

    while (hasMore) {
        console.log(`Processing batch starting after ID ${lastId || 'start'}...`);

        const whereCondition = lastId 
            ? gt(promptRuns.id, lastId)
            : sql`1=1`;

        const runs = await db
            .select({
                run: promptRuns,
                prompt: prompts,
                brand: brands,
            })
            .from(promptRuns)
            .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
            .innerJoin(brands, eq(prompts.brandId, brands.id))
            .where(whereCondition)
            .orderBy(promptRuns.id)
            .limit(BATCH_SIZE);

        if (runs.length === 0) {
            hasMore = false;
            break;
        }

        // Transform and batch insert
        const events = runs.map(({ run, prompt, brand }) => ({
            id: run.id,
            prompt_id: run.promptId,
            brand_id: prompt.brandId,
            brand_name: brand.name,
            prompt_value: prompt.value,
            prompt_group_category: prompt.groupCategory,
            prompt_group_prefix: prompt.groupPrefix,
            prompt_tags: prompt.tags || [],
            prompt_system_tags: prompt.systemTags || [],
            model_group: run.modelGroup,
            model: run.model,
            web_search_enabled: run.webSearchEnabled ? 1 : 0,
            brand_mentioned: run.brandMentioned ? 1 : 0,
            competitors_mentioned: run.competitorsMentioned || [],
            web_queries: run.webQueries || [],
            text_content: extractTextContent(run.rawOutput, run.modelGroup),
            created_at: run.createdAt.toISOString(),
            competitor_count: (run.competitorsMentioned || []).length,
            has_competitor_mention: (run.competitorsMentioned || []).length > 0 ? 1 : 0,
            run_date: run.createdAt.toISOString().split('T')[0],
        }));

        await ingestToTinybird('prompt_runs', events);

        // Extract citations for each run
        const allCitations = [];
        for (const { run, prompt } of runs) {
            const citations = extractCitations(run.rawOutput, run.modelGroup);
            for (const c of citations) {
                allCitations.push({
                    prompt_run_id: run.id,
                    prompt_id: run.promptId,
                    brand_id: prompt.brandId,
                    model_group: run.modelGroup,
                    url: c.url,
                    domain: c.domain,
                    title: c.title || null,
                    category: c.category || 'other',
                    created_at: run.createdAt.toISOString(),
                    run_date: run.createdAt.toISOString().split('T')[0],
                });
            }
        }
        
        if (allCitations.length > 0) {
            await ingestToTinybird('citations', allCitations);
        }

        // Update progress
        lastId = runs[runs.length - 1].run.id;
        await redis.set(PROGRESS_KEY, lastId);
        totalProcessed += runs.length;
        
        if (totalProcessed % 10000 === 0) {
            console.log(`Processed ${totalProcessed} rows...`);
        }

        // Rate limit to avoid overwhelming Tinybird
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Backfill complete! Total processed: ${totalProcessed}`);
    await redis.del(PROGRESS_KEY);
}

backfillPromptRuns().catch(console.error);
```

---

## New Use Cases Enabled

### 1. Full-Text Search on LLM Responses ⭐ NEW
Search across all response content to find specific topics, phrases, or patterns:
- "What are LLMs saying about our pricing?"
- "Find all responses mentioning 'customer support'"
- "Which responses recommend competitors?"
- Track frequency of specific terms over time

### 2. Content Analysis & Sentiment Detection
Identify positive/negative language patterns in responses:
- Responses with "expensive", "overpriced", "costly" (negative pricing sentiment)
- Responses with "recommend", "best choice", "top pick" (positive recommendations)
- Compare sentiment across different LLM providers

### 3. Real-Time Visibility Alerts
With sub-second queries, implement real-time alerts when visibility drops below thresholds.

### 4. Competitive Benchmarking
Track competitor mention frequency across all prompts and models in real-time.

### 5. Model Comparison Analytics
Compare LLM performance (brand mention rates, citation quality) across OpenAI vs Anthropic vs Google.

### 6. Prompt Optimization Insights
Identify which prompt patterns lead to higher brand visibility using fast exploratory queries.

### 7. Citation Network Analysis
Build domain affinity graphs to understand which sources are commonly cited together.

### 8. Web Query Analysis
Analyze what search queries LLMs are using and how they correlate with brand mentions.

### 9. Cohort Analysis
Compare visibility trends for prompts created in different time periods or with different configurations.

### 10. Response Quality Monitoring
Search for hallucinations, factual errors, or outdated information in LLM responses by searching for specific incorrect claims.

---

## Cost Considerations

### Tinybird Pricing Factors
- **Ingestion**: ~$0.07 per million rows
- **Storage**: ~$0.023 per GB/month (compressed)
- **Queries**: ~$0.07 per million rows scanned

### Estimated Costs (based on current data patterns)

| Metric | Estimate |
|--------|----------|
| Daily prompt runs | ~10,000 |
| Avg citations per run | ~5 |
| Storage per run | ~2KB (compressed) |
| Daily ingestion | ~100K events |
| Daily queries | ~50K |

**Monthly estimate**: ~$50-100/month for moderate usage

### Cost Optimization Strategies
1. Use materialized views to pre-aggregate (reduces query scan costs)
2. Set TTL on raw_outputs to auto-expire old data
3. Only store raw_output for runs needing deep analysis
4. Use partition pruning in queries (always filter by date range)

---

## Rollback Plan

If issues arise:

1. **Immediate**: Set `TINYBIRD_READ_PRIMARY=false` → falls back to PostgreSQL
2. **Short-term**: Continue dual-write while investigating
3. **Long-term**: If Tinybird doesn't meet needs, remove ingestion code and revert API routes

PostgreSQL remains the source of truth until Phase 5 cutover is confirmed stable.

---

## Dependencies & Prerequisites

### Required
- [ ] Tinybird account and workspace
- [ ] `TINYBIRD_TOKEN` and `TINYBIRD_BASE_URL` environment variables
- [ ] `@chronark/zod-bird` or similar Tinybird client library

### Recommended
- [ ] Tinybird CLI for local development (`tb`)
- [ ] Monitoring/alerting for Tinybird endpoints (Datadog, etc.)

---

## Open Questions

1. **Data Retention**: How long should we retain raw_output in Tinybird? (90 days recommended)
2. **Real-time Requirements**: Is near-real-time (seconds) sufficient, or do we need true real-time?
3. **Access Control**: Should Tinybird endpoints be exposed directly to frontend, or proxied through Next.js API?
4. **Historical Depth**: How far back should we backfill? (All time vs. last 6 months?)
5. **Full-Text Search Scope**: Should we also index `prompt_value` and `web_queries` for full-text search?
6. **Advanced Search Features**: Do we need fuzzy matching, stemming, or synonyms? (May require additional tooling)

---

## Full-Text Search: ClickHouse vs Alternatives

### ClickHouse Full-Text Capabilities (What We Get)

| Feature | Supported | Notes |
|---------|-----------|-------|
| Token matching | ✅ | Fast with bloom filter index |
| Case-insensitive | ✅ | `hasTokenCaseInsensitive()` |
| Multi-term (AND/OR) | ✅ | `multiSearchAny()` |
| Phrase search | ✅ | `positionCaseInsensitive()` |
| Regex patterns | ✅ | `match()` function |
| Fuzzy/typo-tolerant | ⚠️ | `ngramSearch()` - less accurate |
| Stemming | ❌ | Not built-in |
| Synonyms | ❌ | Not built-in |
| Relevance ranking | ⚠️ | Basic (position-based) |
| Highlighting | ⚠️ | Manual with substring() |

### When to Consider Elasticsearch Instead

If you need:
- Sophisticated relevance ranking (BM25, TF-IDF)
- Stemming ("running" matches "run")
- Synonym expansion ("cheap" matches "affordable")
- Fuzzy matching with high accuracy
- Faceted search with complex filters

### Recommendation

**Start with ClickHouse/Tinybird** - the token-based search covers 90% of use cases:
- "Find responses mentioning X" ✅
- "How often does term Y appear?" ✅
- "Show me responses with multiple terms" ✅

If advanced search features become critical, you can:
1. Add Elasticsearch alongside for search-specific queries
2. Use a hybrid approach (analytics in ClickHouse, search in ES)
3. Build a simple search index in PostgreSQL with `pg_trgm` for fuzzy matching

---

## Appendix: Tinybird CLI Commands

```bash
# Install Tinybird CLI
pip install tinybird-cli

# Authenticate
tb auth

# Push data sources
tb push datasources/prompt_runs.datasource
tb push datasources/citations.datasource

# Push pipes (endpoints)
tb push pipes/dashboard_summary.pipe
tb push pipes/visibility_timeseries.pipe

# Test endpoint locally
tb pipe stats dashboard_summary --params "brand_id=brand_123"

# View data source info
tb datasource ls
tb datasource prompt_runs
```
