---
"@workspace/web": patch
"@workspace/api-spec": patch
---

`/api/v1` now answers a brand's visibility, share of voice, per-model breakdown and citation totals from one `GET /brands/{brandId}/analytics`, lists trackable answer engines at `GET /models`, and addresses a model answer through its prompt at `GET /prompts/{promptId}/runs/{runId}`.
