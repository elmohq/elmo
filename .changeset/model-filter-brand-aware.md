---
"@workspace/web": patch
---

Redesigned the Visibility and Citations filter bar around dropdowns (model, tags, lookback) on the left and a right-aligned search field, replacing the old tab row + filters popover + segmented lookback pills. Each dropdown subscribes only to its own URL key and uses `useOptimistic` inside `startTransition` so trigger labels flip instantly on click while the downstream refetch runs at transition priority and can be interrupted by the next interaction.

Model filters across Visibility, Citations, and prompt detail now reflect `brand.enabledModels`: brands with every model keep the full list, brands with 2+ configured models see just those plus "All", and single-model brands lose the dropdown entirely. The prompt detail "Web Queries" tab only shows per-model sections for models the brand actually runs.

Visibility-bar rollup is now a single SQL query (LVCF in the database via `count() OVER` + `LEFT JOIN` of the branded-prompt subquery) plus a `count(*)` citation total, instead of per-prompt-per-day rows + JS LVCF and a per-domain `GROUP BY` that got reduced to a scalar. Cuts load time from ~10s to under 1s on large brands.

Fixes:
- Visibility-page tag filter matched no prompts when "unbranded" was selected — only the `BRANDED` system tag was being pushed onto effective tags.
- Search input flashed back to the previous value when clearing via the X (urgent `setLocal` vs. transition-priority URL setter race).
- Mid-word search highlights broke words visually because of extra `px-0.5` padding on the `<mark>`.
