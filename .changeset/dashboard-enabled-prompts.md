---
"@workspace/web": patch
---

Fix the dashboard briefly showing "No Data Yet" with "none are currently enabled" right after the onboarding wizard finishes in local mode (no `onboardingRedirectUrlTemplate`). The wizard now busts the dashboard and citation query caches on save so the page re-renders with fresh state instead of waiting on the 30–60s auto-refetch.
