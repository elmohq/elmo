# Elmo MCP Server

[Elmo](https://www.elmohq.com) is an open-source AI visibility and answer engine optimization (AEO)
platform. It tracks how AI answer engines — ChatGPT, Claude, Perplexity, Gemini,
Google AI Overviews, and others — mention, cite, and describe your brand. Its MCP server lets an AI
client read that data and manage the prompts Elmo tracks, so you can ask how a brand is doing and
why without copying numbers between windows.

- Endpoint: `https://app.elmohq.com/api/mcp` (Streamable HTTP)
- Auth: sign in from the client with OAuth — no app to register — or send an API key as a bearer token
- Docs: <https://www.elmohq.com/docs/api/mcp>

## Connect

Most clients only need the URL, then ask you to sign in the first time they use it.

```bash
# Every client installed on this machine
npx add-mcp https://app.elmohq.com/api/mcp --name elmo

# Claude Code (then run /mcp and choose Authenticate)
claude mcp add --transport http elmo https://app.elmohq.com/api/mcp

# Codex
codex mcp add elmo --url https://app.elmohq.com/api/mcp && codex mcp login elmo

# VS Code
code --add-mcp '{"name":"elmo","type":"http","url":"https://app.elmohq.com/api/mcp"}'
```

In Claude.ai, ChatGPT, Cursor, and other clients, add a remote MCP server with the same
URL. The [docs](https://www.elmohq.com/docs/api/mcp) have step-by-step setup for each one.

For a client that can't open a browser, issue an API key under **Settings → API Keys** and send it
as `Authorization: Bearer elmo_...`. A key can be read-only and narrowed to selected brands.

## Tools

| Tool | What It Does |
| --- | --- |
| `whoami` | What this connection is and what it can access |
| `list_models` | The AI models this instance knows about and which it tracks |
| `list_brands`, `get_brand` | Brands you track and their domains, aliases, models, and cadence |
| `list_competitors` | Competitors tracked for a brand |
| `list_prompts`, `list_prompt_tags` | Tracked prompts and their tags |
| `get_analytics` | Visibility, share of voice, sentiment, and position over a time window |
| `get_prompt_performance` | The same metrics broken down by prompt |
| `get_citations` | The pages and domains AI answers cite |
| `get_query_fanout` | The web searches models ran before answering |
| `get_opportunities` | The latest opportunities report: what to write, what to fix, and the risks found |
| `list_runs`, `get_run` | Recorded answers for a prompt, and one answer's full text and citations |
| `get_billing` | Plan and usage |
| `create_prompts`, `update_prompt` | Add and edit tracked prompts (needs write access) |

A connection only sees the tools it's allowed to call.

## Try

> What is the visibility and share of voice for each tagged prompt in Elmo for Acme?

> What are some AEO opportunities for Acme?

## Self-Hosting

Elmo is open source. A self-hosted instance serves the same endpoint at `<APP_URL>/api/mcp`; see
the [self-hosting notes](https://www.elmohq.com/docs/api/mcp#self-hosting).
