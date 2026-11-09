---
"@workspace/lib": patch
"@elmohq/cli": patch
"@workspace/web": patch
---

The Microsoft Copilot app now requires a sign-in, so Copilot now tracks Bing Copilot, the Copilot Search answer Bing still shows signed-out visitors, and is labelled Bing Copilot in the app. Brands keep their Copilot pick and history. Bing Copilot cites different sources from the Copilot app, so expect a step in Copilot charts from this release. For self-hosted users, `copilot:cloro:online` and `copilot:searchapi:online` keep running, `copilot:dataforseo:online` is new, and `copilot:brightdata:online` and `copilot:olostep:online` are skipped until you replace them with one of those three. The LLMs settings page now lists any skipped scrape target with its replacement.
