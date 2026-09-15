---
name: elmo-ai-visibility
description: Measure and improve how AI answer engines describe and cite a brand, using an Elmo deployment over MCP or its REST API. Use when asked about AI visibility, answer engine optimization (AEO), generative engine optimization (GEO), share of voice in AI answers, or which sources ChatGPT, Perplexity, Gemini, Copilot, Grok, or Google AI Overviews cite about a company.
---

# Elmo AI visibility

[Elmo](https://www.elmohq.com) runs a set of prompts across the major AI answer engines on a
schedule and records what came back: whether the brand appeared, which competitors appeared
alongside it, which pages the models cited, and which web searches they ran to get there. This
skill is how to read that data and turn it into a plan.

You need access to an Elmo deployment. Cloud is `https://app.elmohq.com`; a self-hosted instance
serves the same endpoints on its own address, so substitute it throughout.

## Connecting

**MCP (preferred).** The endpoint is `/api/mcp`:

```bash
claude mcp add --transport http elmo https://app.elmohq.com/api/mcp
```

Signing in from the client opens a browser and the connection then acts as that user. For a client
that cannot open a browser, send an organization API key as `Authorization: Bearer elmo_…`. Keys
are issued from the dashboard, scoped read or read-write, and may be narrowed to a subset of
brands. Call `whoami` to see what the current connection actually holds — `tools/list` is filtered
to it, so a missing tool means a missing scope, not a missing feature.

**REST.** Base URL `/api/v1`, same Bearer token. The OpenAPI description is at
<https://www.elmohq.com/api/openapi.json> and the reference at
<https://www.elmohq.com/docs/api.md>.

## Reading a brand

Every brand-scoped call takes a `brandId`, so start with `list_brands` (`GET /brands`).

Analytics calls take a window as `start` and `end`, both ISO 8601 timestamps, half-open — `start`
is included, `end` is not:

```
start=2026-01-01T00:00:00Z  end=2026-02-01T00:00:00Z
```

**Rates and shares are fractions of 1, not percentages.** A visibility of `0.42` is 42%. Multiply
before showing a number to a person, and never compare a fraction against a percentage.

| Question | Tool | REST |
| --- | --- | --- |
| How is this brand doing? | `get_analytics` | `GET /brands/{id}/analytics` |
| Which prompts surface it and which don't? | `get_prompt_performance` | `GET /brands/{id}/prompt-performance` |
| What are the models reading? | `get_citations` | `GET /brands/{id}/citations/domains`, `/urls` |
| What did they actually search for? | `get_query_fanout` | `GET /brands/{id}/query-fanout` |
| What should we do about it? | `get_opportunities` | `GET /brands/{id}/opportunities` |
| What did one answer look like? | `list_runs`, `get_run` | `GET /prompts/{id}/runs` |

`get_analytics` is the right first call for "how is this brand doing": it returns visibility and its
daily trend, share of voice against the tracked competitors, a per-model breakdown, and citation
totals in one response.

## Turning it into an AEO plan

Visibility is the score; citations and query fan-out are the reasons. A useful investigation runs
in that order:

1. **`get_analytics`** — establish the level and the direction. Look at the per-model breakdown
   before concluding anything: a brand can be strong in Perplexity and absent from Google AI
   Overviews, and the fix differs.
2. **`get_prompt_performance`** — find which questions the brand loses. Disabled prompts are not
   sampled and report nothing, so check that a zero means absence rather than no data.
3. **`get_citations`** — each cited domain and URL is categorized as the brand's own, a
   competitor's, or editorial. The editorial pages are the leverage: they are where the models are
   getting their answers, and they are reachable by outreach and by publishing better material than
   what is there.
4. **`get_query_fanout`** — the web searches the models actually ran. These are frequently not the
   prompt's wording, and they are the phrasings worth optimizing for.
5. **`get_opportunities`** — Elmo's own stored report of what to write, what to fix, and what the
   risks are. Check its `status` field: it says whether there was enough data to write one at all.

Tracking a new question is `create_prompts`; `update_prompt` enables, disables, or edits an
existing one. Both need the `write` scope.

## Things that will trip you up

- A window with no runs in it returns zeros, not an error. Confirm with `list_runs` before
  reporting a decline.
- Share of voice is relative to the *tracked* competitors (`list_competitors`), not the whole
  market. Say which set it is measured against.
- Models change. `list_models` reports what this deployment currently samples; a trend that breaks
  on a specific date is often a model change rather than a visibility change.
- Answer engines are non-deterministic. One run is an anecdote — read rates across a window, not
  single answers, and use `get_run` only to show what an answer looked like.

## Further reading

- <https://www.elmohq.com/llms.txt> — index of everything published here
- <https://www.elmohq.com/docs/mcp.md> — full MCP setup, including self-hosted and other clients
- <https://www.elmohq.com/docs/user-guide.md> — what each metric means and how it is computed
- <https://github.com/elmohq/elmo> — source, MIT licensed
