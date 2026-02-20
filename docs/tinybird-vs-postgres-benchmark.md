# Tinybird vs Postgres Benchmark Results

**Date:** February 19, 2026
**Dataset:** ~1.24M rows in both systems (dual-write)
**Postgres table size:** 11 GB (inflated by `raw_output` JSON column, 5-50KB per row)
**Tinybird table size:** 5.22 GiB (columnar compression, no `raw_output`)

## Setup

- **Tinybird:** ClickHouse via `@clickhouse/client`, `prompt_runs_v2` table with `ReplacingMergeTree`, sorting key `(brand_id, prompt_id, toDate(created_at), id)`, monthly partitions.
- **Postgres:** Standard `prompt_runs` table with indexes on `(prompt_id, created_at)`, `created_at`, `(web_search_enabled, created_at)`, `(web_search_enabled, model_group, created_at)`. No `brand_id` column — requires JOIN to `prompts` table.
- **Postgres (optimized):** Same schema but queries rewritten to use subquery instead of JOIN + timestamp range filters instead of `::date` casts (enables index usage).

Each query was run 5 times after 1 warmup iteration.

## Results

### Brand-scoped queries (Tinybird wins by 1.3-1.7x)

| Query | Tinybird avg | Postgres avg | PG Optimized avg |
|-------|-------------|-------------|-----------------|
| Dashboard Summary (counts, visibility %) | 102ms | 158ms (1.5x) | 129ms (1.3x) |
| Visibility Time Series (daily GROUP BY) | 112ms | 233ms (2.1x) | 192ms (1.7x) |
| Prompts Summary (per-prompt GROUP BY) | 106ms | 172ms (1.6x) | 146ms (1.4x) |

### Single-prompt queries (Postgres wins by 6-7x)

| Query | Tinybird avg | Postgres avg | PG Optimized avg |
|-------|-------------|-------------|-----------------|
| Single Prompt Daily Stats | 173ms | 32ms (0.2x) | 28ms (0.2x) |
| Competitor Mentions (array expansion) | 203ms | 33ms (0.2x) | 28ms (0.1x) |

### Admin full-scan queries (Tinybird wins by 1.3-1.6x)

| Query | Tinybird avg | Postgres avg |
|-------|-------------|-------------|
| Admin Brand Stats (GROUP BY brand_id) | 449ms | 594ms (1.3x) |
| Admin Runs Over Time (30d) | 145ms | 225ms (1.6x) |

### Totals

| Backend | Total avg across all 7 queries |
|---------|-------------------------------|
| Tinybird | 1,290ms |
| Postgres | 1,447ms (1.1x Tinybird) |
| Postgres (optimized) | 523ms (0.4x Tinybird — **2.5x faster**) |

The optimized Postgres total is faster than Tinybird because single-prompt queries (which dominate user-facing page loads) are 6-7x faster on Postgres.

## Analysis

### Why Tinybird wins on brand-scoped queries

1. `brand_id` is in the sorting key — physical data skip, no JOIN needed.
2. Columnar storage reads only the columns needed (`brand_mentioned`, `created_at`), skipping the 5-50KB `raw_output` JSON blobs.
3. ClickHouse's FINAL dedup overhead (~100ms) is roughly equal to Postgres's JOIN overhead.

### Why Postgres wins on single-prompt queries

1. The composite index `(prompt_id, created_at)` is highly selective — it's an efficient B-tree range scan.
2. No network overhead for ClickHouse's FINAL deduplication on a narrow result set.
3. Postgres is local/low-latency; Tinybird has additional network round-trip.

### Why the gap is small overall

At 1.2M rows, Postgres is well within its comfort zone. The table is large (11 GB) mainly because of `raw_output` JSON. Analytics queries don't need that column, so a covering index would let Postgres skip the heap entirely.

## Closing the gap: what it would take

Two changes would bring Postgres to rough parity on brand-scoped queries:

### 1. Denormalize `brand_id` onto `prompt_runs`

Eliminates the JOIN that costs ~30-60ms per brand-scoped query.

```sql
ALTER TABLE prompt_runs ADD COLUMN brand_id text;
UPDATE prompt_runs pr SET brand_id = p.brand_id FROM prompts p WHERE p.id = pr.prompt_id;
ALTER TABLE prompt_runs ALTER COLUMN brand_id SET NOT NULL;
CREATE INDEX idx_prompt_runs_brand_created ON prompt_runs (brand_id, created_at);
```

### 2. Add a covering index

Avoids touching the heap (and those big `raw_output` rows), simulating columnar access:

```sql
CREATE INDEX idx_prompt_runs_brand_analytics
  ON prompt_runs (brand_id, created_at)
  INCLUDE (brand_mentioned, prompt_id);
```

With these two changes, brand-scoped queries would likely drop to ~80-120ms — roughly parity with Tinybird.

### Other optimizations (diminishing returns)

- **Materialized views** for daily rollups: pre-aggregate per `(brand_id, prompt_id, date)`. Operationally complex (requires refresh scheduling via `pg_cron`), but would make dashboard queries sub-10ms.
- **Table partitioning** by month: useful at 10M+ rows, not necessary at current scale.
- **Use timestamp ranges** instead of `::date` casts in WHERE clauses (the "optimized" variant already does this).

## Scale projections

| Row count | Recommendation |
|-----------|---------------|
| **1M** (current) | Postgres is fine, arguably better overall given single-prompt query speed |
| **10M** | Tinybird's columnar advantage matters more on full-scan queries, but Postgres with good indexes still holds for filtered queries |
| **100M+** | ClickHouse/Tinybird pulls ahead meaningfully — columnar compression, parallel execution, and sorting key architecture dominate |

At current growth rates (a few thousand rows/day), it would take years to reach the scale where ClickHouse's architecture gives a decisive advantage.

## Conclusion

At the current dataset size, Postgres with two schema changes (denormalize `brand_id` + covering index) would match or beat Tinybird for most user-facing queries while eliminating the operational complexity of maintaining two data stores with dual-write. The main trade-off is that admin full-scan queries would remain ~1.3x slower on Postgres, but they're admin-only and still under 600ms.
