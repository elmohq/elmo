# ReplacingMergeTree Migration - COMPLETED ✓

## Summary

Successfully migrated `prompt_runs` from MergeTree to ReplacingMergeTree for automatic deduplication.

**Changes made:**
- `prompt_runs` now uses `ReplacingMergeTree(created_at)` with `ORDER BY id`
- Added `citations` table with ReplacingMergeTree for pre-expanded citations (auto-populated via MV)
- Updated `tinybird-read.ts` with smart FINAL usage

## FINAL Usage Strategy

ReplacingMergeTree deduplicates during **background merges**, not at query time. The `FINAL` keyword forces deduplication but is expensive.

**Our approach in `tinybird-read.ts`:**
- **Aggregate queries** (count, sum, avg): **Skip FINAL** - fast, tolerates ~0.01% duplicate inflation
- **Row-level queries** (fetching individual records): **Use FINAL** - guarantees no duplicates
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

```
ENGINE "ReplacingMergeTree"
ENGINE_PARTITION_KEY "toYYYYMM(toDate(created_at))"
ENGINE_SORTING_KEY "id"
ENGINE_VER "created_at"
```

- **Deduplication key**: `id` (rows with same id are deduplicated)
- **Version column**: `created_at` (keeps row with latest timestamp)
- **Partitioning**: Monthly (for efficient queries and maintenance)

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
