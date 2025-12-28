# LLM Response Data Migration to ClickHouse via Tinybird

## Executive Summary

This document outlines the plan to migrate LLM response analytics data from PostgreSQL to ClickHouse using Tinybird, enabling exceptionally fast analytics and flexible new use cases.

**Goals:**
- Sub-second analytics queries at any scale
- Real-time data ingestion for immediate insights
- Flexible schema for future analytics use cases
- Reduced load on primary PostgreSQL database
- **Full-text search on LLM response contents** for content analysis and discovery
- **Timezone-aware date aggregations** - users see data in their local timezone

**Key Architecture Decision: Timezone Handling**

All date-based queries pass `YYYY-MM-DD` dates plus the user's IANA timezone (from browser), 
and ClickHouse handles conversion natively (`toDate(created_at, 'America/New_York')`). 
No buffer math or complex date logic needed. We do NOT use pre-aggregated UTC-based 
materialized views because they cannot correctly handle timezone boundaries.

See "Timezone-Aware Queries" section for details.

---

## Migration Phases Overview

The migration follows a phased approach to ensure zero data loss and validate correctness before cutover.

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Dual-write new data to Tinybird | ✅ Completed |
| **Phase 2** | Backfill historical data | 🔄 Ready to Run |
| **Phase 3** | Add admin migration dashboard | ⬜ Not Started |
| **Phase 4** | Dual-read with verification | ⬜ Not Started |
| **Phase 5** | Cutover to Tinybird-only | ⬜ Not Started |
| **Phase 6** | Cleanup migration infrastructure | ⬜ Not Started |

---

## Phase 1: Dual-Write Setup

**Goal:** Start writing all new incremental data to Tinybird while continuing to write to PostgreSQL.

### Checklist

- [x] **1.1** Create Tinybird account and workspace
- [x] **1.2** Add environment variables (`TINYBIRD_TOKEN`, `TINYBIRD_BASE_URL`)
- [x] **1.3** Install client libraries:
  - [x] `@chronark/zod-bird` for writes (type-safe ingestion)
  - [x] `@clickhouse/client` for reads (direct ClickHouse queries via Tinybird)
- [x] **1.4** Create Tinybird data sources (schemas):
  - [x] `prompt_runs` - Core events table (includes `raw_output` and `citations` array)
  - [x] `citations` - Destination table for expanded citations (auto-populated via MV)
  - [x] `citations_mv` - Materialized view that expands citations array to citations table
- [x] ~~**1.5** Create Tinybird materialized views~~ (REMOVED - see "Why No Daily Materialized Views")
  - ~~`daily_visibility_mv` - Daily aggregates~~
  - ~~`daily_citations_mv` - Citation aggregates~~
- [x] **1.6** Create `src/lib/tinybird.ts` client module with ingestion functions
- [x] **1.7** Modify `src/worker/worker.ts` to dual-write:
  - [x] Add Tinybird ingestion after `savePromptRun()`
  - [x] Handle Tinybird errors gracefully (log but don't fail the job)
- [x] **1.8** Deploy and verify new data is flowing to Tinybird
- [x] **1.9** Monitor ingestion for 24-48 hours to ensure stability

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

- [x] **2.1** Create `scripts/backfill-tinybird.ts` script
- [x] **2.2** ~~Add progress tracking (Redis or database) to support resumable backfill~~ (Skipped - <700k rows runs fast)
- [ ] **2.3** Test backfill on a small subset (e.g., 1 brand, last 30 days)
- [ ] **2.4** Run full historical backfill:
  - [x] Process in batches of 1000 rows
  - [x] ~~Rate limit to avoid overwhelming Tinybird API~~ (Minimal 50ms delay between batches)
  - [x] Log progress every 10,000 rows
- [ ] **2.5** Verify row counts match between PostgreSQL and Tinybird
- [ ] **2.6** Verify data integrity:
  - [ ] Spot check 10 random prompt_runs match
  - [ ] Verify citation counts match for 5 random brands
  - [ ] Verify daily aggregates match for sample date range

### Backfill Script Considerations
- Handle the `created_at` timestamp carefully (use original, not backfill time)
- Extract `text_content` from `raw_output` using existing extraction logic
- Do NOT include denormalized metadata (brand_name, prompt_value, tags) - these are looked up from PostgreSQL at query time

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
import { getDashboardSummary } from '@/lib/tinybird-read'; // Uses @clickhouse/client

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
    const { id: brandId } = await params;
    
    // Always query PostgreSQL (source of truth)
    const startPg = performance.now();
    const postgresResult = await queryPostgres(brandId, filters);
    const pgTime = performance.now() - startPg;
    
    // Optionally verify against Tinybird (via @clickhouse/client)
    if (process.env.TINYBIRD_VERIFY_ENABLED === 'true') {
        const startTb = performance.now();
        // Uses @clickhouse/client - same query works on Tinybird or native ClickHouse
        // Timezone is required, provided by frontend from browser
        const tinybirdResult = await getDashboardSummary(
            brandId, 
            filters.fromDate,   // 'YYYY-MM-DD'
            filters.toDate,     // 'YYYY-MM-DD'
            filters.timezone    // Required - browser's IANA timezone
        );
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

### Timezone-Aware Queries (Primary Approach)

**All date-based queries use timezone-aware aggregation at query time.** We do NOT use 
pre-aggregated UTC-based materialized views for date queries because:

1. A user in New York querying for "Jan 1st" expects events that occurred on Jan 1st in their timezone
2. An event at 11 PM EST on Jan 1st is 4 AM UTC on Jan 2nd - a UTC-based MV would put it in the wrong day
3. Pre-aggregating by UTC date is incompatible with per-user timezone requirements

**Simple approach:** Pass dates as `YYYY-MM-DD` strings plus timezone, let ClickHouse handle conversion natively:

```sql
-- ClickHouse handles timezone conversion natively - no buffer logic needed
SELECT
    toDate(created_at, 'America/New_York') as local_date,
    count() as total_runs,
    sum(brand_mentioned) as brand_mentioned_count,
    round(sum(brand_mentioned) * 100.0 / count(), 1) as visibility
FROM prompt_runs
WHERE brand_id = {brandId:String}
  AND toDate(created_at, {timezone:String}) BETWEEN {fromDate:Date} AND {toDate:Date}
GROUP BY local_date
ORDER BY local_date
```

```typescript
// TypeScript - just pass YYYY-MM-DD dates and timezone, no buffer math needed
export async function getVisibilityByLocalDate(
    brandId: string,
    fromDate: string,   // 'YYYY-MM-DD'
    toDate: string,     // 'YYYY-MM-DD'
    timezone: string    // e.g., 'America/New_York'
) {
    return queryTinybird<{ local_date: string; total_runs: number; visibility: number }>(`
        SELECT
            toDate(created_at, {timezone:String}) as local_date,
            count() as total_runs,
            round(sum(brand_mentioned) * 100.0 / count(), 1) as visibility
        FROM prompt_runs
        WHERE brand_id = {brandId:String}
          AND toDate(created_at, {timezone:String}) BETWEEN {fromDate:Date} AND {toDate:Date}
        GROUP BY local_date
        ORDER BY local_date
    `, { brandId, timezone, fromDate, toDate });
}
```

**Why this is fast enough without materialized views:**

| Scenario | Expected Performance | Notes |
|----------|---------------------|-------|
| Single brand, 30 days | 10-50ms | ClickHouse scans ~10K-50K rows |
| Single brand, 1 year | 50-200ms | ClickHouse scans ~100K-500K rows |
| Single brand, all time | 100-500ms | ClickHouse scans full brand partition |

ClickHouse's columnar storage and partition pruning (`brand_id` + date range) make on-the-fly 
aggregation extremely fast. The sorting key `brand_id, prompt_id, toDate(created_at), created_at` 
ensures efficient data locality for these queries.

**Timezone Strategy:**

| Request Source | Timezone Handling |
|----------------|-------------------|
| **UI (browser)** | Always use browser's timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| **API (programmatic)** | Caller provides exact timestamps - timezone conversion not needed |

```typescript
// Frontend - always include browser timezone in requests
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
// e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo'

fetch(`/api/brands/${brandId}/dashboard-summary?` + new URLSearchParams({
    fromDate: '2024-01-01',
    toDate: '2024-01-31',
    timezone: userTimezone,
}));
```

```typescript
// API route - require timezone for date-based queries
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
    const { id: brandId } = await params;
    const searchParams = request.nextUrl.searchParams;
    
    const fromDate = searchParams.get('fromDate');  // 'YYYY-MM-DD'
    const toDate = searchParams.get('toDate');      // 'YYYY-MM-DD'
    const timezone = searchParams.get('timezone');  // Required from frontend
    
    if (!timezone) {
        return NextResponse.json({ error: 'timezone parameter required' }, { status: 400 });
    }
    
    // Validate timezone is a valid IANA timezone
    try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    }
    
    const result = await getDashboardSummary(brandId, fromDate, toDate, timezone);
    return NextResponse.json(result);
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

Immutable event stream optimized for analytics queries. Contains only **immutable event data** - 
prompt/brand metadata that can change (name, tags, etc.) is NOT stored here and should be 
joined from PostgreSQL at query time.

```sql
-- Tinybird Data Source: prompt_runs
SCHEMA >
    id String,
    prompt_id String,
    brand_id String,
    -- NOTE: brand_name, prompt_value, prompt_group_*, prompt_tags, prompt_system_tags
    -- are NOT stored here. They can change and should be joined from PostgreSQL.
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
    -- Full-text search index (tokenized for fast text search)
    INDEX text_content_idx text_content TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 4

ENGINE "MergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(toDate(created_at))"
ENGINE_SORTING_KEY "brand_id, prompt_id, toDate(created_at), created_at"
```

> **Full-Text Search Note**: The `tokenbf_v1` index is a token bloom filter that enables fast 
> full-text search on `text_content`. This allows efficient queries like "find all responses 
> mentioning 'pricing'" without scanning every row.

> **Why No Denormalized Metadata**: Fields like `brand_name`, `prompt_value`, `prompt_tags`, 
> and `prompt_system_tags` are NOT stored in Tinybird. These values can change at the prompt 
> or brand level, and storing them would cause stale data issues. Instead, queries that need 
> this metadata should:
> 1. Query Tinybird for aggregates/analytics (fast)
> 2. Join with current PostgreSQL data for display labels (using `prompt_id`/`brand_id`)
> 
> This keeps the event stream immutable and accurate.

> **Timezone Handling**: We store `created_at` as `DateTime64(3, 'UTC')` and derive dates at 
> query time using ClickHouse's native timezone conversion: `toDate(created_at, 'America/New_York')`.
> We do NOT use UTC-based materialized views for date aggregations because they cannot correctly
> handle timezone boundaries. See "Timezone-Aware Queries" section for the query pattern.

#### 2. `citations` (Auto-populated via Materialized View)

Citations are stored as an array in `prompt_runs` and automatically expanded to a separate
`citations` table via a materialized view. This gives us:
- **Single ingestion call** - Only ingest to `prompt_runs`
- **Best query patterns** - Citation analytics query the expanded table (no arrayJoin needed)
- **Automatic sync** - MV triggers on every insert, no dual-write logic

```sql
-- In prompt_runs: citations stored as parallel arrays (Nested structure)
`citations.url` Array(String),
`citations.domain` Array(String),
`citations.title` Array(String),

-- Materialized view expands to citations table
SELECT
    id AS prompt_run_id,
    prompt_id,
    brand_id,
    model_group,
    url, domain, title,
    created_at
FROM prompt_runs
ARRAY JOIN
    `citations.url` AS url,
    `citations.domain` AS domain,
    `citations.title` AS title
WHERE length(`citations.url`) > 0
```

```sql
-- Tinybird Data Source: citations (destination for MV)
SCHEMA >
    prompt_run_id String,
    prompt_id String,
    brand_id String,
    model_group LowCardinality(String),
    url String,
    domain LowCardinality(String),
    title Nullable(String),
    created_at DateTime64(3, 'UTC')

ENGINE "MergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(toDate(created_at))"
ENGINE_SORTING_KEY "brand_id, prompt_id, domain, toDate(created_at)"
```

#### Why `raw_output` is in `prompt_runs` (Not Separate)

Initially we planned a separate `raw_outputs` datasource, but this was unnecessary:

1. **ClickHouse is columnar** - If you don't SELECT `raw_output`, it's never read from disk
2. **Same retention policy** - We keep analytics data and raw outputs permanently
3. **Simpler ingestion** - One less API call per prompt run
4. **No JOIN needed** - When you need raw output for a specific run, it's right there

The `raw_output` column is included in `prompt_runs` as a JSON string. It compresses well and doesn't affect query performance on other columns.

### Why No Daily Materialized Views

We intentionally **do not use** pre-aggregated daily materialized views for date-based queries.

#### The Problem with UTC-Based Daily MVs

Pre-aggregating by UTC date creates a fundamental mismatch with timezone-aware queries:

```
Example: User event at 11:00 PM EST on January 1st
├── UTC time: 4:00 AM January 2nd
├── UTC-based MV: Aggregated into January 2nd bucket
└── User expectation: Should appear in January 1st report
```

This means:
1. **MVs cannot be used** for timezone-aware date queries (the data is in the wrong buckets)
2. **You'd always query raw tables** anyway for accurate local date aggregations
3. **MVs add complexity and storage** for data that can't be used

#### Why Raw Table Queries Are Fast Enough

ClickHouse's architecture makes on-the-fly aggregation extremely efficient:

| Feature | Benefit |
|---------|---------|
| **Columnar storage** | Only reads columns needed for query |
| **Partition pruning** | Skips partitions outside date range |
| **Sorting key** | `brand_id, prompt_id, toDate(created_at)` ensures data locality |
| **Vectorized execution** | Processes millions of rows per second |
| **Native timezone support** | `toDate(ts, 'America/New_York')` is highly optimized |

**Expected performance for timezone-aware aggregations:**
- 10K-50K rows (30 days): **10-50ms**
- 100K-500K rows (1 year): **50-200ms**
- 1M+ rows (all time): **100-500ms**

#### When MVs Would Make Sense

Materialized views are beneficial when:
1. You need aggregations that **don't involve date breakdowns** (e.g., total counts)
2. You have a **single timezone** for all users (can pre-aggregate in that timezone)
3. You're querying **very large datasets** where even ClickHouse struggles (billions of rows)

None of these apply to our use case, where users need timezone-specific daily breakdowns.

---

## Published API Endpoints

All date-based endpoints require a `timezone` parameter (IANA timezone from browser).
Dates are passed as `YYYY-MM-DD` strings, and ClickHouse handles timezone conversion natively.

### 1. Dashboard Summary

```sql
-- Endpoint: /v0/pipes/dashboard_summary.json
-- Parameters: brand_id, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD), timezone (IANA)
-- NOTE: For non_branded_visibility, you need to filter by prompt_ids from PostgreSQL
-- where the prompt's systemTags don't include 'branded'

SELECT
    countDistinct(prompt_id) as total_prompts,
    count() as total_runs,
    round(sum(brand_mentioned) * 100.0 / count(), 1) as avg_visibility,
    max(toDate(created_at, {{String(timezone)}})) as last_updated
FROM prompt_runs
WHERE brand_id = {{String(brand_id)}}
  AND toDate(created_at, {{String(timezone)}}) BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
```

> **Note**: For filtered queries (e.g., non-branded visibility), first fetch the list of 
> qualifying `prompt_id`s from PostgreSQL, then pass them to the Tinybird query with 
> `AND prompt_id IN ({prompt_ids:Array(String)})`.

### 2. Visibility Time Series

```sql
-- Endpoint: /v0/pipes/visibility_timeseries.json
-- Parameters: brand_id, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD), timezone (IANA)

WITH daily AS (
    SELECT
        toDate(created_at, {{String(timezone)}}) as local_date,
        count() as day_runs,
        sum(brand_mentioned) as day_mentioned
    FROM prompt_runs
    WHERE brand_id = {{String(brand_id)}}
      AND toDate(created_at, {{String(timezone)}}) BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
    GROUP BY local_date
)
SELECT
    local_date as date,
    round(
        sumIf(day_mentioned, 1=1) OVER w * 100.0 /
        sumIf(day_runs, 1=1) OVER w, 
        1
    ) as visibility_7d_avg
FROM daily
WINDOW w AS (ORDER BY local_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
ORDER BY local_date
```

### 3. Citation Stats

```sql
-- Endpoint: /v0/pipes/citation_stats.json
-- Parameters: brand_id, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD), timezone (IANA)

SELECT
    domain,
    category,
    count() as total_citations
FROM citations
WHERE brand_id = {{String(brand_id)}}
  AND toDate(created_at, {{String(timezone)}}) BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
GROUP BY domain, category
ORDER BY total_citations DESC
LIMIT 100
```

### 4. Prompt Chart Data

```sql
-- Endpoint: /v0/pipes/prompt_chart.json
-- Parameters: brand_id, prompt_id, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD), timezone (IANA), model_group (optional)

SELECT
    toDate(created_at, {{String(timezone)}}) as date,
    model_group,
    count() as runs,
    sum(brand_mentioned) as brand_mentions,
    round(sum(brand_mentioned) * 100.0 / count(), 1) as visibility
FROM prompt_runs
WHERE brand_id = {{String(brand_id)}}
  AND prompt_id = {{String(prompt_id)}}
  AND toDate(created_at, {{String(timezone)}}) BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
  {% if defined(model_group) %}
  AND model_group = {{String(model_group)}}
  {% end %}
GROUP BY date, model_group
ORDER BY date
```

### 5. Prompts Summary (Aggregates Only)

```sql
-- Endpoint: /v0/pipes/prompts_summary.json
-- Parameters: brand_id, from_date (YYYY-MM-DD), to_date (YYYY-MM-DD), timezone (IANA)
-- NOTE: prompt_value, tags, group_category etc. are NOT in Tinybird.
-- Join this result with prompt metadata from PostgreSQL using prompt_id.

SELECT
    prompt_id,
    count() as total_runs,
    round(sum(brand_mentioned) * 100.0 / count(), 1) as brand_mention_rate,
    round(sum(has_competitor_mention) * 100.0 / count(), 1) as competitor_mention_rate,
    max(toDate(created_at, {{String(timezone)}})) as last_run_date
FROM prompt_runs
WHERE brand_id = {{String(brand_id)}}
  AND toDate(created_at, {{String(timezone)}}) BETWEEN {{Date(from_date)}} AND {{Date(to_date)}}
GROUP BY prompt_id
ORDER BY total_runs DESC
```

> **Tag Filtering Pattern**: To filter by tags, first query PostgreSQL for prompt_ids matching 
> your tag criteria, then pass those IDs to Tinybird:
> ```sql
> WHERE prompt_id IN ({prompt_ids:Array(String)})
> ```

### 6. Full-Text Search on Response Content

Search across all LLM response text for specific terms, phrases, or patterns.

```sql
-- Endpoint: /v0/pipes/content_search.json
-- Parameters: brand_id, query, from_date (optional), to_date (optional), model_group (optional)
-- NOTE: prompt_value is NOT stored in Tinybird - join with PostgreSQL using prompt_id

SELECT
    id,
    prompt_id,
    model_group,
    brand_mentioned,
    text_content,
    created_at
FROM prompt_runs
WHERE brand_id = {{String(brand_id, '')}}
  -- Full-text search using token matching (uses the bloom filter index)
  AND hasTokenCaseInsensitive(text_content, {{String(query, '')}})
  {% if defined(from_date) %}
  AND toDate(created_at) >= {{Date(from_date)}}
  {% end %}
  {% if defined(to_date) %}
  AND toDate(created_at) <= {{Date(to_date)}}
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
-- NOTE: prompt_value is NOT stored in Tinybird - join with PostgreSQL using prompt_id

SELECT
    id,
    prompt_id,
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
-- NOTE: prompt_value is NOT stored in Tinybird - join with PostgreSQL using prompt_id

SELECT
    id,
    prompt_id,
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
-- NOTE: prompt_value is NOT stored in Tinybird - join with PostgreSQL using prompt_id
SELECT 
    prompt_id,
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

### Client Library Strategy

We use two different client libraries for writes and reads:

| Operation | Library | Rationale |
|-----------|---------|-----------|
| **Writes** | `@chronark/zod-bird` | Type-safe ingestion with Zod schema validation |
| **Reads** | `@clickhouse/client` | Native ClickHouse protocol for queries |

**Why this split?** This architecture makes it easier to migrate between Tinybird and self-hosted ClickHouse in the future:
- **Writes** through `zod-bird` are Tinybird-specific (Events API), but could be swapped to direct ClickHouse inserts
- **Reads** through `@clickhouse/client` work identically against Tinybird or native ClickHouse (Tinybird exposes a ClickHouse-compatible endpoint)

If we ever need to move off Tinybird, only the write code needs to change - all read queries remain unchanged.

### Tinybird Write Client (zod-bird)

```typescript
// src/lib/tinybird-write.ts

import { Tinybird } from '@chronark/zod-bird';
import { z } from 'zod';

const tb = new Tinybird({ token: process.env.TINYBIRD_TOKEN! });

// Citation schema for array items (expanded via MV)
const citationItemSchema = z.object({
    url: z.string(),
    domain: z.string(),
    title: z.string().nullable(),
});

// Define typed data source schemas
// NOTE: Prompt/brand metadata (brand_name, prompt_value, prompt_group_*, prompt_tags, prompt_system_tags)
// is NOT stored here - it should be joined from PostgreSQL at query time since those values can change.
const promptRunSchema = z.object({
    id: z.string(),
    prompt_id: z.string(),
    brand_id: z.string(),
    model_group: z.string(),
    model: z.string(),
    web_search_enabled: z.number(),
    brand_mentioned: z.number(),
    competitors_mentioned: z.array(z.string()),
    web_queries: z.array(z.string()),
    text_content: z.string(),
    raw_output: z.string(),  // JSON stringified - stored in same table since ClickHouse is columnar
    citations: z.array(citationItemSchema),  // Expanded to citations table via MV
    created_at: z.string(),  // DateTime64 - dates derived at query time for timezone handling
    competitor_count: z.number(),
    has_competitor_mention: z.number(),
});

// Type-safe ingestion functions
// Only prompt_runs - citations are auto-expanded via materialized view
export const ingestPromptRuns = tb.buildIngestEndpoint({
    datasource: 'prompt_runs',
    event: promptRunSchema,
});

// Wrapper with feature flag
export async function ingestToTinybird<T>(
    ingestFn: (events: T[]) => Promise<void>,
    events: T[]
): Promise<void> {
    if (process.env.TINYBIRD_WRITE_ENABLED !== 'true') return;
    
    try {
        await ingestFn(events);
    } catch (error) {
        console.error('Tinybird ingestion failed:', error);
        // Don't throw - ingestion failures shouldn't block the main flow
    }
}
```

### Tinybird Read Client (@clickhouse/client)

```typescript
// src/lib/tinybird-read.ts

import { createClient } from '@clickhouse/client';

// Tinybird exposes a ClickHouse-compatible endpoint
// This makes migration to self-hosted ClickHouse seamless
const client = createClient({
    host: process.env.TINYBIRD_CLICKHOUSE_HOST || 'https://api.tinybird.co',
    username: 'default',
    password: process.env.TINYBIRD_TOKEN!,
    // For Tinybird, use the workspace database
    database: process.env.TINYBIRD_WORKSPACE || 'default',
});

// Generic query function with type inference
export async function queryTinybird<T>(
    query: string,
    params?: Record<string, string | number | boolean | Date>
): Promise<T[]> {
    const result = await client.query({
        query,
        query_params: params,
        format: 'JSONEachRow',
    });
    
    return result.json<T[]>();
}

// Named query helpers - pass YYYY-MM-DD dates and timezone, ClickHouse handles conversion
// NOTE: For non_branded_visibility, you need to filter by prompt_ids from PostgreSQL
// where the prompt's systemTags don't include 'branded'
export async function getDashboardSummary(
    brandId: string, 
    fromDate: string,   // 'YYYY-MM-DD'
    toDate: string,     // 'YYYY-MM-DD'
    timezone: string    // IANA timezone from browser
) {
    return queryTinybird<{
        total_prompts: number;
        total_runs: number;
        avg_visibility: number;
        last_updated: string;
    }>(`
        SELECT
            countDistinct(prompt_id) as total_prompts,
            count() as total_runs,
            round(sum(brand_mentioned) * 100.0 / count(), 1) as avg_visibility,
            max(toDate(created_at, {timezone:String})) as last_updated
        FROM prompt_runs
        WHERE brand_id = {brandId:String}
          AND toDate(created_at, {timezone:String}) BETWEEN {fromDate:Date} AND {toDate:Date}
    `, { brandId, timezone, fromDate, toDate });
}

export async function getVisibilityTimeSeries(
    brandId: string, 
    fromDate: string,   // 'YYYY-MM-DD'
    toDate: string,     // 'YYYY-MM-DD'
    timezone: string    // IANA timezone from browser
) {
    return queryTinybird<{
        date: string;
        visibility_7d_avg: number;
    }>(`
        WITH daily AS (
            SELECT
                toDate(created_at, {timezone:String}) as local_date,
                count() as day_runs,
                sum(brand_mentioned) as day_mentioned
            FROM prompt_runs
            WHERE brand_id = {brandId:String}
              AND toDate(created_at, {timezone:String}) BETWEEN {fromDate:Date} AND {toDate:Date}
            GROUP BY local_date
        )
        SELECT
            local_date as date,
            round(
                sumIf(day_mentioned, 1=1) OVER w * 100.0 /
                sumIf(day_runs, 1=1) OVER w, 
                1
            ) as visibility_7d_avg
        FROM daily
        WINDOW w AS (ORDER BY local_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
        ORDER BY local_date
    `, { brandId, timezone, fromDate, toDate });
}

// NOTE: prompt_value is NOT stored in Tinybird - join with PostgreSQL using prompt_id
export async function searchResponseContent(
    brandId: string,
    searchQuery: string,
    options?: { fromDate?: string; toDate?: string; modelGroup?: string; limit?: number }
) {
    const { fromDate, toDate, modelGroup, limit = 100 } = options || {};
    
    let query = `
        SELECT
            id,
            prompt_id,
            model_group,
            brand_mentioned,
            text_content,
            created_at
        FROM prompt_runs
        WHERE brand_id = {brandId:String}
          AND hasTokenCaseInsensitive(text_content, {searchQuery:String})
    `;
    
    const params: Record<string, any> = { brandId, searchQuery, limit };
    
    if (fromDate) {
        query += ` AND toDate(created_at) >= {fromDate:Date}`;
        params.fromDate = fromDate;
    }
    if (toDate) {
        query += ` AND toDate(created_at) <= {toDate:Date}`;
        params.toDate = toDate;
    }
    if (modelGroup) {
        query += ` AND model_group = {modelGroup:String}`;
        params.modelGroup = modelGroup;
    }
    
    query += ` ORDER BY created_at DESC LIMIT {limit:UInt32}`;
    
    return queryTinybird<{
        id: string;
        prompt_id: string;
        model_group: string;
        brand_mentioned: number;
        text_content: string;
        created_at: string;
    }>(query, params);
}
```

### Worker Integration

```typescript
// src/worker/worker.ts - Add after savePromptRun()

import { ingestToTinybird, ingestPromptRuns, TinybirdPromptRunEvent, TinybirdCitationItem } from '@/lib/tinybird';
import { extractCitations } from '@/lib/text-extraction';

// Function to send data to Tinybird (dual-write)
// Errors are logged but don't fail the main job
// NOTE: Prompt/brand metadata (brand_name, prompt_value, prompt_tags, etc.) is NOT sent here.
// Those values can change and should be joined from PostgreSQL at query time.
async function sendToTinybird(
    promptRunId: string,
    promptId: string,
    brandId: string,
    modelGroup: "openai" | "anthropic" | "google",
    model: string,
    webSearchEnabled: boolean,
    rawOutput: any,
    webQueries: string[],
    brandMentioned: boolean,
    competitorsMentioned: string[],
    textContent: string,
): Promise<void> {
    const now = new Date();

    // Extract citations (will be auto-expanded to citations table via MV)
    const extractedCitations = extractCitations(rawOutput, modelGroup);
    const citations: TinybirdCitationItem[] = extractedCitations.map((c) => ({
        url: c.url,
        domain: c.domain,
        title: c.title || null,
    }));

    // Send single event - citations array is auto-expanded via materialized view
    const event: TinybirdPromptRunEvent = {
        id: promptRunId,
        prompt_id: promptId,
        brand_id: brandId,
        model_group: modelGroup,
        model: model,
        web_search_enabled: webSearchEnabled ? 1 : 0,
        brand_mentioned: brandMentioned ? 1 : 0,
        competitors_mentioned: competitorsMentioned,
        web_queries: webQueries,
        text_content: textContent,
        raw_output: JSON.stringify(rawOutput),
        citations: citations,
        created_at: now.toISOString(),
        competitor_count: competitorsMentioned.length,
        has_competitor_mention: competitorsMentioned.length > 0 ? 1 : 0,
    };

    await ingestToTinybird(ingestPromptRuns, [event]);
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
import { promptRuns, prompts } from '../src/lib/db/schema';
import { eq, gt, sql } from 'drizzle-orm';
import { ingestToTinybird, ingestPromptRuns, TinybirdCitationItem } from '../src/lib/tinybird';
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

        // NOTE: We only need prompt for brandId lookup - no need to join brands
        // since we're not storing denormalized metadata
        const runs = await db
            .select({
                run: promptRuns,
                prompt: prompts,
            })
            .from(promptRuns)
            .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
            .where(whereCondition)
            .orderBy(promptRuns.id)
            .limit(BATCH_SIZE);

        if (runs.length === 0) {
            hasMore = false;
            break;
        }

        // Transform and batch insert
        // NOTE: No denormalized metadata (brand_name, prompt_value, tags, etc.)
        // Those are looked up from PostgreSQL at query time
        const events = runs.map(({ run, prompt }) => {
            const extractedCitations = extractCitations(run.rawOutput, run.modelGroup);
            const citations: TinybirdCitationItem[] = extractedCitations.map((c) => ({
                url: c.url,
                domain: c.domain,
                title: c.title || null,
            }));

            return {
                id: run.id,
                prompt_id: run.promptId,
                brand_id: prompt.brandId,
                model_group: run.modelGroup,
                model: run.model,
                web_search_enabled: run.webSearchEnabled ? 1 : 0,
                brand_mentioned: run.brandMentioned ? 1 : 0,
                competitors_mentioned: run.competitorsMentioned || [],
                web_queries: run.webQueries || [],
                text_content: extractTextContent(run.rawOutput, run.modelGroup),
                raw_output: JSON.stringify(run.rawOutput),
                citations: citations,
                created_at: run.createdAt.toISOString(),
                competitor_count: (run.competitorsMentioned || []).length,
                has_competitor_mention: (run.competitorsMentioned || []).length > 0 ? 1 : 0,
            };
        });

        // Use zod-bird for type-safe writes
        // Citations are auto-expanded via materialized view
        await ingestToTinybird(ingestPromptRuns, events);

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
1. ~~Use materialized views to pre-aggregate~~ — Not used due to timezone requirements
2. ~~Set TTL on raw_outputs to auto-expire old data~~ — raw_output now in prompt_runs with same retention
3. ~~Only store raw_output for runs needing deep analysis~~ — columnar storage means it's not read unless selected
4. **Use partition pruning** — Always filter by `created_at` date range AND `brand_id`
5. **Leverage sorting key** — Queries on `brand_id + prompt_id + date` are extremely fast
6. **Column projection** — Only SELECT needed columns (ClickHouse only reads referenced columns)

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
- [ ] Environment variables:
  - `TINYBIRD_TOKEN` - API token for authentication
  - `TINYBIRD_BASE_URL` - Base URL for Tinybird API (default: `https://api.tinybird.co`)
  - `TINYBIRD_CLICKHOUSE_HOST` - ClickHouse-compatible endpoint for reads
  - `TINYBIRD_WORKSPACE` - Workspace/database name for ClickHouse client
- [ ] Client libraries:
  - `@chronark/zod-bird` - Type-safe writes with Zod schema validation
  - `@clickhouse/client` - Native ClickHouse protocol for reads (works with Tinybird's ClickHouse endpoint)

### Why Two Libraries?

| Library | Purpose | Migration Path |
|---------|---------|----------------|
| `zod-bird` | Writes (ingestion) | Swap to direct ClickHouse inserts if migrating |
| `@clickhouse/client` | Reads (queries) | **Zero changes needed** - works with Tinybird or native ClickHouse |

This split makes future migration to self-hosted ClickHouse straightforward:
- Tinybird exposes a ClickHouse-compatible endpoint, so all read queries work unchanged
- Only write code needs to be updated (replace zod-bird with direct ClickHouse inserts)

### Recommended
- [ ] Tinybird CLI for local development (`tb`)
- [ ] Monitoring/alerting for Tinybird endpoints (Datadog, etc.)

---

## Open Questions

1. ~~**Data Retention**: How long should we retain raw_output in Tinybird? (90 days recommended)~~ — **RESOLVED**: Same permanent retention as analytics data
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
