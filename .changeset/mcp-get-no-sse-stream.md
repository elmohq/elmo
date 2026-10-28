---
"@workspace/web": patch
---

The MCP endpoint no longer hands connected clients an empty event stream they reconnect to every second, which could add tens of thousands of requests a day per client.
