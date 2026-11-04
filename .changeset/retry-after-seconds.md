---
"@workspace/api-spec": patch
"@workspace/web": patch
---

A rate-limited API request's `Retry-After` header now gives the wait in seconds instead of milliseconds, and the API reference lists it as the only header a `429` carries.
