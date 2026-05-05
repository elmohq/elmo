---
"@workspace/web": patch
---

REST-style brand management API: `GET/POST /api/v1/brands`, `GET/PATCH /api/v1/brands/{brandId}`, `POST /api/v1/tools/analyze`, and full CRUD for `/api/v1/competitors`. API-created brands skip onboarding — callers hit `tools/analyze` first if they want suggestions, then create brands with whatever they choose to keep.
