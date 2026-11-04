---
"@workspace/api-spec": patch
"@workspace/web": patch
---

API responses now carry standard `RateLimit-Policy` and `RateLimit` headers so clients can pace themselves.
