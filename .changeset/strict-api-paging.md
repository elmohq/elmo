---
"@workspace/api-spec": patch
"@workspace/web": patch
---

API list endpoints now return a 400 for an out-of-range or non-numeric page or limit instead of clamping it to the maximum value.
