---
"@workspace/web": patch
"@workspace/api-spec": patch
---

Breaking: `/api/v1` DELETE endpoints now return the deleted resource directly instead of a `{ message, data }` wrapper (the deleted prompt includes a `deletedRunsCount` field), PATCH endpoints reject an empty body with a 400, an unparseable `website` on `/tools/analyze` is now a 400 instead of a 500, and 500 responses no longer echo internal error messages.
