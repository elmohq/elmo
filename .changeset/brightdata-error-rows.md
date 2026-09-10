---
"@workspace/lib": patch
---

Fixed problem where certain types of BrightData scraping failures wrote the error as a response on a successful prompt run. These cases now fail.
