---
"@workspace/api-spec": patch
"@workspace/web": patch
---

The API now returns a 400 for an out-of-range or non-numeric page, limit, kMentions, or kCitations instead of clamping it into range.
