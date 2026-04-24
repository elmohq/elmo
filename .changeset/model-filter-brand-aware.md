---
"@workspace/web": patch
---

Redesign the Visibility and Citations filter bar (model / tags / lookback dropdowns + search), wire model filters to `brand.enabledModels`, and move the visibility-bar rollup into a single SQL query — cuts load time from ~10s to under 1s on large brands. Also fixes the "unbranded" tag filter and a search clear-X flicker.
