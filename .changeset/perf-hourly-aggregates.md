---
"@workspace/web": patch
"@workspace/worker": patch
"@workspace/lib": patch
---

Speed up the overview, visibility, citations, and prompt-detail dashboards by serving every chart and stat from worker-maintained hourly aggregate tables instead of scanning the raw `prompt_runs` and `citations` tables on every request. Page wall time at 90-day lookbacks drops from tens of seconds (with multi-second tails) to well under one second. No user-visible data changes apart from a worst-case 60-second staleness window. Charts continue to render in the viewer's browser timezone.
