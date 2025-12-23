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
- `competitors` (by `brand_id`)

### Current Query Patterns

1. **Visibility Time Series** - Daily/rolling average of brand mentions across prompts
2. **Citation Analytics** - Extract URLs from nested `raw_output` JSON (OpenAI/Google formats)
3. **Dashboard Aggregations** - Counts, percentages, grouped by date/model/brand
4. **Prompt-Level Charts** - Per-prompt visibility trends over time

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

Flattened event stream optimized for analytics queries.

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
    -- Will be filled at query time or via lookup
    0 as is_branded,
    count() as total_runs,
    sum(brand_mentioned) as brand_mentioned_count,
    sum(has_competitor_mention) as competitor_mentioned_count
FROM prompt_runs
GROUP BY brand_id, prompt_id, run_date, model_group, web_search_enabled

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
-- Parameters: brand_id, lookback (1w, 1m, 3m, 6m, 1y, all)

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

### 5. Full-Text Search on Response Content

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

### 6. Multi-Term Content Search

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

### 7. Content Analytics - Term Frequency

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

### 8. Response Content Snippets

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

## Migration Strategy

### Phase 1: Dual-Write Setup (Week 1-2)

1. **Create Tinybird Data Sources** - Set up schemas in Tinybird workspace

2. **Add Ingestion Pipeline** - Modify worker to send data to both PostgreSQL and Tinybird

```typescript
// src/worker/worker.ts - Add after savePromptRun()

import { Tinybird } from '@chronark/zod-bird';

const tb = new Tinybird({ token: process.env.TINYBIRD_TOKEN! });

async function sendToTinybird(
    promptRun: {
        id: string;
        promptId: string;
        brandId: string;
        brandName: string;
        promptValue: string;
        groupCategory: string | null;
        groupPrefix: string | null;
        modelGroup: string;
        model: string;
        webSearchEnabled: boolean;
        brandMentioned: boolean;
        competitorsMentioned: string[];
        webQueries: string[];
        textContent: string;
        rawOutput: any;
    }
) {
    // Send core event
    await tb.events('prompt_runs', {
        id: promptRun.id,
        prompt_id: promptRun.promptId,
        brand_id: promptRun.brandId,
        brand_name: promptRun.brandName,
        prompt_value: promptRun.promptValue,
        prompt_group_category: promptRun.groupCategory,
        prompt_group_prefix: promptRun.groupPrefix,
        model_group: promptRun.modelGroup,
        model: promptRun.model,
        web_search_enabled: promptRun.webSearchEnabled ? 1 : 0,
        brand_mentioned: promptRun.brandMentioned ? 1 : 0,
        competitors_mentioned: promptRun.competitorsMentioned,
        web_queries: promptRun.webQueries,
        text_content: promptRun.textContent,
        created_at: new Date().toISOString(),
        competitor_count: promptRun.competitorsMentioned.length,
        has_competitor_mention: promptRun.competitorsMentioned.length > 0 ? 1 : 0,
        run_date: new Date().toISOString().split('T')[0],
    });

    // Extract and send citations
    const citations = extractCitations(promptRun.rawOutput, promptRun.modelGroup);
    if (citations.length > 0) {
        await tb.events('citations', citations.map(c => ({
            prompt_run_id: promptRun.id,
            prompt_id: promptRun.promptId,
            brand_id: promptRun.brandId,
            model_group: promptRun.modelGroup,
            url: c.url,
            domain: c.domain,
            title: c.title || null,
            category: categorizeDomain(c.domain, promptRun.brandId),
            created_at: new Date().toISOString(),
            run_date: new Date().toISOString().split('T')[0],
        })));
    }

    // Optionally store raw output (can skip for cost savings)
    await tb.events('raw_outputs', {
        prompt_run_id: promptRun.id,
        brand_id: promptRun.brandId,
        model_group: promptRun.modelGroup,
        raw_output: JSON.stringify(promptRun.rawOutput),
        created_at: new Date().toISOString(),
    });
}
```

### Phase 2: Historical Backfill (Week 2-3)

1. **Create Backfill Script**

```typescript
// scripts/backfill-tinybird.ts

import { db } from '../src/lib/db/db';
import { promptRuns, prompts, brands, competitors } from '../src/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { Tinybird } from '@chronark/zod-bird';
import { extractTextContent, extractCitations } from '../src/lib/text-extraction';

const BATCH_SIZE = 1000;
const tb = new Tinybird({ token: process.env.TINYBIRD_TOKEN! });

async function backfillPromptRuns() {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        console.log(`Processing batch starting at offset ${offset}...`);

        const runs = await db
            .select({
                run: promptRuns,
                prompt: prompts,
                brand: brands,
            })
            .from(promptRuns)
            .innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
            .innerJoin(brands, eq(prompts.brandId, brands.id))
            .orderBy(promptRuns.createdAt)
            .limit(BATCH_SIZE)
            .offset(offset);

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
            model_group: run.modelGroup,
            model: run.model,
            web_search_enabled: run.webSearchEnabled ? 1 : 0,
            brand_mentioned: run.brandMentioned ? 1 : 0,
            competitors_mentioned: run.competitorsMentioned,
            web_queries: run.webQueries,
            text_content: extractTextContent(run.rawOutput, run.modelGroup),
            created_at: run.createdAt.toISOString(),
            competitor_count: run.competitorsMentioned.length,
            has_competitor_mention: run.competitorsMentioned.length > 0 ? 1 : 0,
            run_date: run.createdAt.toISOString().split('T')[0],
        }));

        await tb.events('prompt_runs', events);

        // Extract citations for each run
        for (const { run, prompt } of runs) {
            const citations = extractCitations(run.rawOutput, run.modelGroup);
            if (citations.length > 0) {
                await tb.events('citations', citations.map(c => ({
                    prompt_run_id: run.id,
                    prompt_id: run.promptId,
                    brand_id: prompt.brandId,
                    model_group: run.modelGroup,
                    url: c.url,
                    domain: c.domain,
                    title: c.title || null,
                    category: 'other', // Will need to categorize based on brand/competitors
                    created_at: run.createdAt.toISOString(),
                    run_date: run.createdAt.toISOString().split('T')[0],
                })));
            }
        }

        offset += BATCH_SIZE;
        
        // Rate limit to avoid overwhelming Tinybird
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Backfill complete!');
}

backfillPromptRuns();
```

### Phase 3: API Migration (Week 3-4)

1. **Create Tinybird Client Wrapper**

```typescript
// src/lib/tinybird.ts

import { z } from 'zod';

const TINYBIRD_BASE_URL = process.env.TINYBIRD_BASE_URL || 'https://api.tinybird.co';
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN!;

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

2. **Add Feature Flag for Gradual Migration**

```typescript
// src/lib/feature-flags.ts

export const USE_TINYBIRD_ANALYTICS = process.env.USE_TINYBIRD_ANALYTICS === 'true';
```

3. **Update API Routes**

```typescript
// src/app/api/brands/[id]/dashboard-summary/route.ts

import { USE_TINYBIRD_ANALYTICS } from '@/lib/feature-flags';
import { queryTinybird } from '@/lib/tinybird';

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
    const { id: brandId } = await params;
    
    if (USE_TINYBIRD_ANALYTICS) {
        // Fast path: Tinybird
        const [summary] = await queryTinybird<DashboardSummary>('dashboard_summary', {
            brand_id: brandId,
            from_date: fromDate.toISOString().split('T')[0],
        });
        
        const timeSeries = await queryTinybird<VisibilityPoint>('visibility_timeseries', {
            brand_id: brandId,
            from_date: fromDate.toISOString().split('T')[0],
            to_date: toDate.toISOString().split('T')[0],
        });

        return NextResponse.json({
            ...summary,
            visibilityTimeSeries: timeSeries,
        });
    }
    
    // Fallback: PostgreSQL (existing code)
    // ...
}
```

### Phase 4: Validation & Cutover (Week 4-5)

1. **Shadow Mode Testing**
   - Run both PostgreSQL and Tinybird queries in parallel
   - Compare results and log discrepancies
   - Monitor query latencies

2. **Performance Comparison Dashboard**
   - Track P50/P95/P99 latencies
   - Measure data freshness (ingestion lag)
   - Monitor error rates

3. **Cutover Checklist**
   - [ ] All historical data backfilled
   - [ ] Query results match within tolerance
   - [ ] Latency improvements confirmed
   - [ ] Alerting configured for Tinybird endpoints
   - [ ] Rollback procedure documented

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

1. **Immediate**: Disable `USE_TINYBIRD_ANALYTICS` flag → falls back to PostgreSQL
2. **Short-term**: Continue dual-write while investigating
3. **Long-term**: If Tinybird doesn't meet needs, remove ingestion code and revert API routes

PostgreSQL remains the source of truth throughout migration, ensuring data safety.

---

## Implementation Timeline

| Week | Phase | Tasks |
|------|-------|-------|
| 1 | Setup | Create Tinybird workspace, define schemas, set up auth |
| 1-2 | Dual-Write | Add Tinybird ingestion to worker, test with new data |
| 2-3 | Backfill | Run historical migration script, validate data counts |
| 3-4 | API Migration | Add feature flags, implement Tinybird API endpoints |
| 4-5 | Validation | Shadow testing, performance comparison, cutover |
| 5+ | Optimization | Add new analytics use cases, tune materialized views |

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
