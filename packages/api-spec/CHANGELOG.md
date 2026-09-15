# @workspace/api-spec

## 0.4.1

No changes in this release.

## 0.4.0

### Minor Changes

- c9142f7: Elmo now serves a full external API and an MCP server. `/api/v1` covers brands, prompts, competitors, reports, analytics, models, tags, and opportunities. `/api/mcp` connects Claude Code, Codex, Cursor, OpenCode, and VS Code, either by signing in from the client or with an API key. Keys belong to an organization and are issued read-only or read-write from Settings, which now also has API and MCP pages describing your own deployment.

### Patch Changes

- 8c953b1: Every `/api/v1` list response now includes a `data` array. The `brands`, `prompts`, `competitors`, and `reports` keys still carry the same array and will be removed in a future release.

## 0.3.0

## 0.2.19

## 0.2.18

## 0.2.17

## 0.2.16

## 0.2.15

## 0.2.14

## 0.2.13

### Patch Changes

- c4505ba: Breaking: `/api/v1` DELETE endpoints now return the deleted resource directly instead of a `{ message, data }` wrapper (the deleted prompt includes a `deletedRunsCount` field), PATCH endpoints reject an empty body with a 400, an unparseable `website` on `/tools/analyze` is now a 400 instead of a 500, and 500 responses no longer echo internal error messages.

## 0.2.12

## 0.2.11

## 0.2.10

## 0.2.9

## 0.2.8

## 0.2.7

## 0.2.6

### Patch Changes

- 1a1005a: Admin `/api/v1/brands` endpoints (POST, GET, PATCH) now accept and return a single `domains` list instead of `website` + `additionalDomains`. This future-proofs against a future db model change.

## 0.2.5

### Patch Changes

- 7cba46d: License Elmo under the MIT License. Add Code of Conduct, Contributing guide, Security policy, and a lightweight CLA process.

## 0.2.4

## 0.2.3

## 0.2.2

## 0.2.1

## 0.2.0

### Minor Changes

- 95b71db: Replace visibility % with Share of Voice metric across reports, add reports API, and redesign report for print
