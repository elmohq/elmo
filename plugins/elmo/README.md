# Elmo for Cursor

Connects Cursor to [Elmo Cloud](https://www.elmohq.com)'s MCP server, so the agent can read how AI
answer engines describe and cite your brand and manage the prompts Elmo tracks.

Cursor asks you to sign in to Elmo the first time the server is used. Tools and setup for other
clients are documented at <https://www.elmohq.com/docs/api/mcp>.

A self-hosted Elmo serves the same endpoint on its own address; point `~/.cursor/mcp.json` at
`<your APP_URL>/api/mcp` instead of installing this plugin.
