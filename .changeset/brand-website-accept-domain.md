---
"@workspace/web": patch
---

Accept bare domains (e.g. `example.com`) in the brand website field and normalize the stored value to the origin (`https://example.com/products` is saved as `https://example.com/`).
