---
"@workspace/web": patch
"@workspace/lib": patch
---

Elmo instances now serve an MCP server at `/api/mcp`, so Claude, Cursor, and other MCP clients can read your AI-visibility data and manage prompts directly. Connect by signing in from the client, or with an API key from Settings → API keys — a connection is only offered the tools its permissions allow.
