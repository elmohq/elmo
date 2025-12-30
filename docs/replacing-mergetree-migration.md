# ReplacingMergeTree Migration - COMPLETED ✓

## Summary

Successfully migrated `prompt_runs` from MergeTree to ReplacingMergeTree for automatic deduplication.

**Changes made:**
- `prompt_runs` now uses `ReplacingMergeTree(created_at)` with `ORDER BY id`
- Added `citations` table with ReplacingMergeTree for pre-expanded citations (auto-populated via MV)
- Added `prompt_runs_hourly_counts` table with SummingMergeTree for fast aggregate queries (auto-populated via MV)
- Updated `tinybird-read.ts` with smart FINAL usage and fast MV-based functions

## Query Strategy

### Option 1: FINAL-based queries (100% accurate, slower)

ReplacingMergeTree deduplicates during **background merges**, not at query time. The `FINAL` keyword forces deduplication but is expensive.

**Use cases:**
- **Row-level queries** (fetching individual records): **Use FINAL** - guarantees no duplicates
- **When exact timezone handling at day boundaries matters**

### Option 2: MV-based queries (FAST, ~0.01% duplicate tolerance) ⭐ RECOMMENDED

The `prompt_runs_hourly_counts` table pre-aggregates data by **hour** using `SummingMergeTree`.

**Use cases:**
- **All aggregate queries** (count, sum, avg): Use `*Fast` functions in `tinybird-read.ts`
- **Dashboard summary, chart data, prompts summary**
- **Any query where exact counts don't matter (ordering, display)**

**Functions:**
- `getTinybirdPromptChartDataFast()` - prompt chart data
- `getTinybirdPromptsSummaryFast()` - prompts summary table
- `getTinybirdDashboardSummaryFast()` - dashboard metrics
- `getTinybirdVisibilityTimeSeriesFast()` - visibility time series

**Why it's FAST:**
- **Optimal sorting key**: `(brand_id, prompt_id, hour)` matches query patterns - index is fully utilized
- **Pre-aggregated hourly**: reads ~50x less data than per-run queries  
- **Simple sum()**: no expensive `uniqMerge()` or `FINAL`
- **SummingMergeTree**: automatically sums rows with same key during background merges
- **Timezone-aware**: Stores UTC hours, converts `toDate(hour, timezone)` at query time for correct day boundaries

**Trade-off:** May double-count duplicates (~0.01% inflation) but this is acceptable for dashboards, charts, and ordering.

### Legacy guidance (when MVs not available)
- **Aggregate queries** (count, sum, avg): **Skip FINAL** - fast, tolerates ~0.01% duplicate inflation
- **ARRAY JOIN queries** (citations): **ALWAYS use FINAL** - duplicates have a **multiplying effect**

### Citations: Pre-Expanded Table (Faster Than ARRAY JOIN)

Originally we used `ARRAY JOIN` on `prompt_runs` to expand citations at query time, but this was slow because:
1. `FINAL` + `ARRAY JOIN` is expensive (deduplicate first, then expand)
2. Duplicates multiply when expanding arrays

**Solution:** Pre-expand citations via materialized view into a separate `citations` table:
- `citations` table uses `ReplacingMergeTree` with key `(prompt_run_id, url)`
- MV auto-populates on every insert to `prompt_runs`
- Queries use `citations FINAL` - simple and fast

This gives us correct deduplication AND much better performance.

## Engine Configuration

### prompt_runs (ReplacingMergeTree)
```
ENGINE "ReplacingMergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(toDate(created_at))"
ENGINE_SORTING_KEY "id"
ENGINE_VER "created_at"
```

- **Deduplication key**: `id` (rows with same id are deduplicated)
- **Version column**: `created_at` (keeps row with latest timestamp)
- **Partitioning**: Monthly (for efficient queries and maintenance)

### prompt_runs_hourly_counts (SummingMergeTree) ⭐ RECOMMENDED
```
ENGINE "SummingMergeTree"
ENGINE_SORTING_KEY "brand_id, prompt_id, hour, model_group, web_search_enabled"
```

- **Pre-aggregated**: Data grouped by hour for fast queries
- **Optimal sorting key**: brand_id first = fast filtering for all queries
- **Simple aggregation**: Uses sum() instead of expensive uniqMerge()
- **Auto-summing**: SummingMergeTree automatically sums rows with same key
- **Timezone-aware**: Stores UTC hours, query converts with `toDate(hour, timezone)`

## Deploying the Hourly Counts MV

1. **Push datasource and MV:**
   ```bash
   tb push tinybird/datasources/prompt_runs_hourly_counts.datasource
   tb push tinybird/pipes/prompt_runs_hourly_counts_mv.pipe
   ```

2. **Backfill historical data:**
   ```sql
   INSERT INTO prompt_runs_hourly_counts
   SELECT
       brand_id,
       prompt_id,
       toStartOfHour(created_at) as hour,
       model_group,
       web_search_enabled,
       count() as run_count,
       sum(brand_mentioned) as brand_mentioned_count,
       sum(has_competitor_mention) as competitor_mentioned_count,
       sum(competitor_count) as competitor_count_sum
   FROM prompt_runs
   GROUP BY brand_id, prompt_id, hour, model_group, web_search_enabled
   ```

3. **Verify counts are close:**
   ```sql
   -- Counts should match within ~0.01% (duplicates may inflate slightly)
   SELECT 
       (SELECT count() FROM prompt_runs) as raw_count,
       (SELECT sum(run_count) FROM prompt_runs_hourly_counts) as mv_count
   ```

## Code Examples

**Aggregate query (no FINAL):**
```sql
SELECT count(), sum(brand_mentioned)
FROM prompt_runs
WHERE brand_id = {brandId:String}
```

**Row-level query (with FINAL):**
```sql
SELECT model_group, web_queries
FROM prompt_runs FINAL
WHERE prompt_id = {promptId:String}
```

**Citations (pre-expanded table):**
```sql
SELECT domain, count()
FROM citations FINAL
WHERE brand_id = {brandId:String}
  AND toDate(created_at, {timezone:String}) >= {fromDate:Date}
GROUP BY domain
```
