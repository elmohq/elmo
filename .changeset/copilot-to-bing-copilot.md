---
"@workspace/lib": patch
"@elmohq/cli": patch
"@workspace/web": patch
---

The Microsoft Copilot app now requires a sign-in, so Elmo no longer scrapes it and tracks Bing Copilot, the Copilot Search answer Bing still shows signed-out visitors, in its place. Elmo Cloud replaces Copilot with Bing Copilot as a scraped engine. For self-hosted users, replace any `copilot` target with `bing-copilot:searchapi:online` or `bing-copilot:dataforseo:online`; both cost about the same per run as scraping Copilot did.
