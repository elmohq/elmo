---
"@workspace/web": patch
---

The model filter on Visibility and Citations now reflects the brand's `enabledModels` instead of the hardcoded four-button bar. Brands that track every model keep today's All/ChatGPT/Claude/Google toggle, brands with 2+ models see just those plus "All", and brands with a single model no longer see a filter at all (since there's nothing to switch between).
