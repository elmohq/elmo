---
"@workspace/web": patch
"@workspace/api-spec": patch
---

Breaking: `/api/v1` DELETE endpoints now return the deleted resource directly instead of a `{ message, data }` wrapper; the deleted prompt includes a `deletedRunsCount` field.
