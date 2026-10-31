---
"@workspace/web": patch
---

Fixed the API's prompt runs list rejecting an out-of-range `page` or `limit` with a `400` instead of clamping it as documented.
