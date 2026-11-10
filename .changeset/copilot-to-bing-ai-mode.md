---
"@workspace/lib": patch
"@elmohq/cli": patch
"@workspace/web": patch
---

The Microsoft Copilot app now requires a sign-in, so Elmo no longer scrapes it and tracks Bing AI Mode, the AI answer Bing still shows signed-out visitors, in its place. Brands that picked Copilot now track Bing AI Mode, which starts its own history; past Copilot runs stay under Microsoft Copilot. For self-hosted users, an existing `copilot:cloro:online` or `copilot:searchapi:online` target keeps running as Bing AI Mode until you rename it to `bing-ai-mode:cloro:online` or `bing-ai-mode:searchapi:online`, and a `copilot` target on BrightData or Olostep is skipped until you replace it with one of those. The LLMs settings page now lists any skipped scrape target with its replacement.
