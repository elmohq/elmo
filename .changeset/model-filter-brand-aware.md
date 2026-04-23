---
"@workspace/web": patch
---

Model filters on Visibility, Citations, and prompt detail pages now reflect the brand's `enabledModels` instead of a hardcoded list. Brands that track every model keep the full set of options, brands with 2+ models see just those plus "All", and brands with a single model no longer see a filter at all. The prompt detail "Web Queries" tab also only breaks out per-model sections for models the brand actually runs.

The Visibility/Citations filter bar is redesigned around dropdowns (model, tags, lookback) on the left with a right-aligned search field, replacing the former tab row + popover + segmented lookback bar.
