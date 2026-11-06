---
"@workspace/web": patch
---

Fixed a spurious "Invalid API key" error logged on every MCP request signed in with OAuth, and MCP clients are now told to refresh an expired access token.
