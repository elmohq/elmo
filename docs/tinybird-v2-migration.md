# Tinybird v2 Migration Guide

This document outlines the migration from `prompt_runs` (v1) to `prompt_runs_v2` with an optimized sorting key for faster queries.

## Problem with v1

The original `prompt_runs` table has:
```
ENGINE_SORTING_KEY "id"
```

This means **every query** must scan all data because `id` provides no locality for filtering by `brand_id`, `prompt_id`, or date ranges.

## v2 Solution

The new `prompt_runs_v2` table has:
```
ENGINE_SORTING_KEY "brand_id, prompt_id, id"
```

This provides:
1. **Index-based filtering** - queries filter by `brand_id` first, skipping irrelevant data
2. **Data locality** - all data for a brand/prompt is physically co-located
3. **FINAL is now fast** - only deduplicates rows matching the WHERE clause

Note: We can't include `toDate(created_at)` in the sorting key because `created_at` is used as ENGINE_VER for deduplication. However, filtering by `brand_id` + `prompt_id` is still a massive improvement over the v1 sorting key of just `id`.

Expected speedup: **10-50x** for typical queries.

## Migration Steps (Tinybird Forward)

This guide uses Tinybird Forward's Git-based deployment (`tb --cloud deploy`).

### Step 1: Pause Writes (Optional but Recommended)

Stop the worker to prevent data arriving during migration:
```bash
# Stop worker process
# Or set TINYBIRD_WRITE_ENABLED=false
```

### Step 2: Deploy v2 Tables + Backfill MVs

First deployment creates tables and backfill MVs (populate runs automatically):

```bash
cd tinybird

# Deploy - new MVs will automatically populate from source tables
tb --cloud deploy
```

This will:
1. Create `prompt_runs_v2` and `citations_v2` datasources
2. Create `backfill_prompt_runs_v2` MV and auto-populate from `prompt_runs`
3. Create `backfill_citations_v2` MV and auto-populate from `prompt_runs_v2`
4. Create `citations_v2_mv` for ongoing citations

Wait for the populate jobs to complete. Monitor in Tinybird dashboard under Jobs.

### Step 3: Remove Backfill MVs

After backfill completes, remove the backfill pipes to prevent double-writes:

```bash
# Delete the backfill pipe files
rm tinybird/pipes/backfill_prompt_runs_v2.pipe
rm tinybird/pipes/backfill_citations_v2.pipe

# Redeploy to remove them from Tinybird
tb --cloud deploy
```

### Step 4: Resume Writes

The worker code is already updated to dual-write to both tables:

```typescript
// In src/worker/worker.ts
await Promise.all([
  ingestToTinybird(ingestPromptRuns, [event]),
  ingestToTinybird(ingestPromptRunsV2, [event]),
]);
```

Resume the worker:
```bash
# Start worker process
# Or set TINYBIRD_WRITE_ENABLED=true
```

### Step 5: Run Benchmarks

Verify v2 is working correctly and faster:

```bash
pnpm tsx scripts/benchmark-tinybird-v2.ts
```

This will:
- Run all major query types against both v1 and v2
- Compare latency and data correctness
- Output CSV for analysis

Expected output:
```
Dashboard Summary: v1=250ms, v2=25ms (10x faster) ✓
Prompts Summary: v1=180ms, v2=15ms (12x faster) ✓
...
```

### Step 6: Switch Reads to v2

Once benchmarks pass, update API routes to use v2:

**Option A: Gradual migration (recommended)**

Update one route at a time:
```typescript
// Before
import { getTinybirdDashboardSummary } from "@/lib/tinybird-read";

// After
import { getDashboardSummary } from "@/lib/tinybird-read-v2";
```

**Option B: Full switchover**

Replace all imports at once. The v2 module has cleaner function names (no "Tinybird" prefix).

### Step 7: Stop v1 Writes

Once all reads are on v2, update the worker to only write to v2:

```typescript
// In src/worker/worker.ts - change this:
await Promise.all([
  ingestToTinybird(ingestPromptRuns, [event]),
  ingestToTinybird(ingestPromptRunsV2, [event]),
]);

// To this:
await ingestToTinybird(ingestPromptRunsV2, [event]);
```

### Step 8: Cleanup (After Verification Period)

After a week of stable operation:

1. Remove v1 imports from `src/lib/tinybird.ts`
2. Delete `src/lib/tinybird-read.ts` (keep v2)
3. Rename `tinybird-read-v2.ts` to `tinybird-read.ts`
4. Delete v1 resources from Tinybird (delete files and redeploy):
   ```bash
   # Delete v1 pipe files
   rm tinybird/pipes/prompt_runs_hourly_counts_mv.pipe
   rm tinybird/pipes/citations_mv.pipe
   
   # Delete v1 datasource files
   rm tinybird/datasources/prompt_runs.datasource
   rm tinybird/datasources/citations.datasource
   rm tinybird/datasources/prompt_runs_hourly_counts.datasource
   
   # Redeploy to remove from Tinybird
   cd tinybird && tb --cloud deploy
   ```

## Rollback Plan

If issues arise, rollback by:

1. Revert worker to v1-only writes
2. Revert API routes to use `tinybird-read.ts`
3. Keep v2 tables for investigation

## Function Mapping (v1 → v2)

| v1 Function | v2 Function | Used |
|-------------|-------------|------|
| `getTinybirdDashboardSummary` | `getDashboardSummary` | ✓ |
| `getTinybirdVisibilityTimeSeries` | `getVisibilityTimeSeries` | ✓ |
| `getTinybirdPromptsSummary` | `getPromptsSummary` | ✓ |
| `getTinybirdCitationDomainStats` | `getCitationDomainStats` | ✓ |
| `getTinybirdCitationUrlStats` | `getCitationUrlStats` | ✓ |
| `getTinybirdPromptDailyStats` | `getPromptDailyStats` | ✓ |
| `getTinybirdPromptCompetitorDailyStats` | `getPromptCompetitorDailyStats` | ✓ |
| `getTinybirdPromptWebQueriesForMapping` | `getPromptWebQueriesForMapping` | ✓ |
| `getTinybirdPromptCitationStats` | `getPromptCitationStats` | ✓ |
| `getTinybirdPromptCitationUrlStats` | `getPromptCitationUrlStats` | ✓ |
| `getTinybirdDailyCitationStats` | `getDailyCitationStats` | ✓ |
| `getTinybirdBrandEarliestRunDate` | `getBrandEarliestRunDate` | ✓ |
| `getTinybirdAdminRunsOverTime` | `getAdminRunsOverTime` | ✓ |
| `getTinybirdAdminBrandRunStats` | `getAdminBrandRunStats` | ✓ |
| `testTinybirdConnection` | `testConnection` | ✓ |

### Removed Functions (Not Used)

These functions existed in v1 but were never imported anywhere:
- `getTinybirdPromptChartData`
- `getTinybirdPromptStats`
- `getTinybirdPromptRunsCount`
- `getTinybirdPromptWebQueries`
- `getTinybirdPromptChartDataFast`
- `getTinybirdPromptsSummaryFast`
- `getTinybirdDashboardSummaryFast`
- `getTinybirdVisibilityTimeSeriesFast` (imported but superseded by regular version)
- `getTinybirdPromptRunDiagnostics`
- `getTinybirdCitationDiagnostics`

## Files Changed

### New Files
- `tinybird/datasources/prompt_runs_v2.datasource` - New table schema
- `tinybird/datasources/citations_v2.datasource` - New citations table
- `tinybird/pipes/citations_v2_mv.pipe` - MV to expand citations (ongoing)
- `tinybird/pipes/backfill_prompt_runs_v2.pipe` - One-time backfill MV (delete after use)
- `tinybird/pipes/backfill_citations_v2.pipe` - One-time citations backfill MV (delete after use)
- `src/lib/tinybird-read-v2.ts` - Optimized read queries
- `scripts/benchmark-tinybird-v2.ts` - Benchmark script
- `docs/tinybird-v2-migration.md` - This document

### Modified Files
- `src/lib/tinybird.ts` - Added `ingestPromptRunsV2` export
- `src/worker/worker.ts` - Dual-write to both tables

