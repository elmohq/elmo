---
"@workspace/lib": patch
"@elmohq/cli": patch
"@workspace/web": patch
---

The Microsoft Copilot app now requires a sign-in, so Elmo no longer scrapes it and tracks Bing AI Mode, the AI answer Bing still shows signed-out visitors, in its place. Brands that picked Copilot now track Bing AI Mode, which starts its own history and does not report query fan-out. Past Copilot runs are kept and still count under "All models", but Copilot is no longer an option in the model filter. For self-hosted users, every `copilot` scrape target is skipped after upgrading, so replace it in `SCRAPE_TARGETS` with `bing-ai-mode:cloro:online` or `bing-ai-mode:searchapi:online` to keep collecting. The LLMs settings page lists any skipped scrape target with its replacement until you do.
