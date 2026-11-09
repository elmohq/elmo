---
"@workspace/web": patch
---

Fixed the MCP analytics tools reading a `start` or `end` without an offset in the server's time zone; they now reject it, as the API does.
