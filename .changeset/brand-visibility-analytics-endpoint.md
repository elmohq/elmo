---
"@workspace/web": minor
"@workspace/lib": minor
"@workspace/api-spec": minor
---

The API now exposes brand visibility over time at `GET /api/v1/brands/{brandId}/visibility`, returning a daily mention-rate series plus period totals for a given date range. This is the first of a planned set of analytics endpoints exposing the dashboard's metrics via the API, and works with both instance-admin keys and dashboard keys scoped to their brands.
