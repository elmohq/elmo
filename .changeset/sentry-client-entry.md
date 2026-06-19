---
"@workspace/web": patch
---

Sentry now initializes in a dedicated client entry before hydration, so client errors thrown during early module evaluation are captured. The router-aware browser-tracing integration is attached separately once the router exists.
