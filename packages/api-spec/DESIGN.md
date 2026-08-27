# Elmo external API — design

The shape of `/api/v1` we are building toward, why each decision was made, and
what we deliberately leave out. `src/openapi.json` is the contract; this file is
the reasoning behind it.

## Goals

1. **Additive.** Everything shipped today keeps working, byte for byte. No path,
   field, or status code changes meaning.
2. **Small and boring.** A handful of orthogonal resources with one obvious way
   to do each thing. An integrator should be able to guess the next endpoint.
3. **Hard to regret.** Anything whose shape we aren't sure of is either left out
   or marked beta. We would rather add an endpoint next quarter than un-promise
   one.
4. **Tenancy is not optional.** Every non-admin request is answered inside a
   single organization's data, and every write is subject to the same plan
   limits the dashboard enforces.

## Non-goals

- Mutating billing. There is no write path and no scope that could grant one.
- Replacing the dashboard. The API exposes the numbers the dashboard shows; it
  does not expose every panel.
- A generic query language. Fixed endpoints with fixed filters.

---

## 1. Authentication

Two kinds of Bearer token, distinguished at the edge by a single resolver.

### 1.1 Instance admin keys — unchanged

`ADMIN_API_KEYS` (comma-separated env var, timing-safe compared). Full access to
every organization and every endpoint, including the admin-only ones. No plan
enforcement — an operator key is for support and automation on an instance the
operator owns. Self-hosters keep using exactly what they use today.

### 1.2 Organization API keys — new

Issued from the dashboard (`Settings → API keys`), backed by better-auth's
`apiKey` plugin: `elmo_…`, hashed at rest, prefix stored for display, optional
expiry, per-key rate limit. Never usable as an app session.

A key carries three things in its metadata:

| Field            | Stored in    | Meaning                                                           |
| ---------------- | ------------ | ----------------------------------------------------------------- |
| scopes           | `permissions`| Closed set of `resource:action` grants (§1.3).                     |
| `organizationId` | `metadata`   | The one organization this key acts inside. Never more than one.    |
| `brandIds`       | `metadata`   | Optional narrowing to a subset of that org's brands. Empty = all.  |

Scopes live in the plugin's own `permissions` column (`{ resource: [action] }`)
rather than in metadata, so revocation and verification stay the plugin's job
and we don't reimplement either. The wire format is the flattened
`resource:action` string.

Effective access = `scopes` ∩ (`organizationId`'s brands, narrowed by
`brandIds`). Resolution is one query and holds no stale authorization: brands
that leave the org disappear from the key's reach on the next request.

**Keys belong to the organization, not to the person who made one.** An admin of
the org can see and revoke every key in it, and the key survives its creator
leaving. The alternative — user-owned keys whose reach is re-derived from live
membership — is more secure on offboarding but silently breaks integrations when
someone changes teams, and makes "which org is this billable to?" ambiguous.
We take the standard trade and mitigate it with org-visible key listing, a
recorded `createdBy`, `lastUsedAt`, and optional expiry.

> **Decision point.** If we would rather keys die with their creator, flip
> `organizationId` from stored metadata to a live-membership intersection. Only
> the resolver changes; nothing in the surface below moves.

At issuance a key can never be granted more than its creator has: the create
dialog offers only organizations the user belongs to and only brands inside the
chosen one.

### 1.3 Scopes

```
brands:read        brands:write
prompts:read       prompts:write
competitors:read   competitors:write
analytics:read
runs:read
billing:read
reports:read       reports:write
```

- `runs:read` is separate from `analytics:read` because raw model answers are
  bulkier and more sensitive than aggregates.
- `billing:read` is opt-in and has **no `:write` counterpart** — that is the
  structural guarantee that the API cannot touch billing, not a policy check
  somewhere that could be forgotten.
- `reports:*` only exists on deployments where `features.reportGeneration` is
  on; on cloud those endpoints stay admin-only as they are today.
- The UI offers presets ("Read-only", "Full access") that expand to scope sets.
  The wire format is always the explicit list, so a preset's meaning can change
  without silently widening existing keys.

Missing scope → `403 insufficient_scope`, naming the scope required. Missing key
→ `401`. A key that resolves but whose org doesn't contain the target brand →
`404`, byte-identical to a brand that doesn't exist, so a key can't probe for
other tenants.

### 1.4 Limits and enforcement

| Concern                | Admin key            | Organization key                                    |
| ---------------------- | -------------------- | --------------------------------------------------- |
| Plan entitlements      | bypassed             | same `assert*` guards the dashboard calls            |
| Read-only (demo) mode  | blocked on writes    | blocked on writes                                    |
| Request rate limit     | none                 | per-key, default 120/min, `X-RateLimit-*` + `429`    |
| Cross-org access       | yes                  | never                                                |

Cloud plan limits are already centralized in `@workspace/lib/entitlements`;
the API's job is to make sure every write path calls them. What each write
spends:

| Write | Guard |
| --- | --- |
| `POST /v1/brands` | `assertCanCreateBrand` |
| `POST /v1/prompts`, re-enabling one | `assertCanAddPrompts` |
| `POST /v1/prompts/bulk` | `assertPromptSaveAllowed` — one decision for the whole batch, against both pools it can spend |
| `PATCH /v1/prompts/{id}` with `premiumModels` | `assertCanAssignPremium` |
| `POST /v1/competitors` | `MAX_COMPETITORS`, already enforced |

Two gaps to close:

- `POST /v1/brands` does not currently call `assertCanCreateBrand`.
- `GET /v1/prompts` clamps `limit` to a minimum but not a maximum.

The two limits with no write path — a brand's platform picks
(`assertEnabledModelsAllowed`) and its sampling cadence
(`assertCadenceAllowed`) — stay that way for now: `enabledModels` and
`delayOverrideHours` are readable on the brand and not writable. Opening either
means carrying its guard, and neither is worth an endpoint until someone asks.

Entitlement denials surface as the errors they already are: `402` when there is
no active plan, `409` for a limit conflict, with the specific reason in `code`.

---

## 2. Conventions

**Base path** `/api/v1`. **Casing** camelCase in JSON bodies and query params,
kebab-case in path segments — matches what already ships.

**Timestamps** ISO-8601 UTC strings. **Dates** `YYYY-MM-DD`.

**Date windows.** Every analytics endpoint takes either
`startDate` + `endDate` (+ optional `timezone`, default `UTC`) or the shorthand
`lookback` ∈ `1w|1m|3m|6m|1y|all`. Exactly one form per request; supplying both
is a `400`. `startDate`/`endDate` is the shipped spelling on
`/prompts/{id}/snapshot` and stays the canonical one.

**Pagination.** `page` (1-based) + `limit` (default 20, max 100), answered with
`{ page, limit, total, totalPages }`. Offset paging everywhere, for one paging
model rather than two.

**List envelopes.** Endpoints that ship today keep their named key
(`{ brands: [...] }`, `{ prompts: [...] }`, …). Every new list returns
`{ data: [...], pagination: {...} }`. We do not retrofit the old ones and we do
not add new named-key lists — the split is "already public" vs "new", which is
easy to explain and costs nothing to hold.

**Filtering.** Repeated or comma-separated `model` and `tags` params where they
apply. Unknown query params are ignored; unknown body fields are stripped.

**Errors.** The existing `{ error, message }` envelope gains an optional stable
machine code:

```json
{ "error": "Conflict", "message": "Your plan tracks up to 200 prompts…", "code": "prompt_limit" }
```

`code` values: `unauthorized`, `insufficient_scope`, `forbidden`, `not_found`,
`validation_error`, `conflict`, `rate_limited`, `read_only`, `no_active_plan`,
`brand_limit`, `prompt_limit`, `platform_not_in_plan`, `platform_picks_exceeded`,
`premium_not_in_plan`, `premium_pool_exhausted`, `cadence_faster_than_plan`,
`internal_error`. Adding a value is not a breaking change; clients must treat
unknown codes as the HTTP status implies.

**Scopes in the spec.** Each operation declares what it needs in
`x-elmo-scopes`. OpenAPI 3.0 only allows a non-empty scope list on `oauth2` and
`openIdConnect` schemes — writing scopes into the `security` array of a plain
bearer scheme produces an invalid document — so the requirement is carried as an
extension and summarized in the API description.

**Stability.** Every operation carries
`x-elmo-stability: stable | beta | planned`.

- `stable` — everything shipped today. Additive changes only.
- `beta` — built and supported, shape may still move while it is being used in
  anger. This is the main lever against locking ourselves in: new endpoints
  land here, not at `stable`.
- `planned` — specified, not built. The document is written ahead of the code,
  so `openapi.json` is the plan's machine-readable half.

`planned` operations are **stripped from the document the app serves and the
docs site renders** (`packages/api-spec/src/published.ts`). Anything a customer
can read in the reference, they can call. Implementing an operation is one
edit — `planned` → `beta` — and it appears in the docs and in
`GET /api/v1/openapi.json` on the same commit.

---

## 3. Resources

### 3.1 Identity — `GET /v1/me`  *(no scope required)*

What this key is, so an integrator can debug in one call.

```json
{
  "keyType": "organization",
  "organizationId": "acme",
  "organizationName": "Acme",
  "scopes": ["brands:read", "prompts:read", "prompts:write", "analytics:read"],
  "brandIds": ["acme-eu"],
  "expiresAt": null,
  "rateLimit": { "limit": 120, "window": "minute" },
  "deployment": { "mode": "cloud", "billingEnabled": true, "readOnly": false }
}
```

Admin keys answer `keyType: "admin"` with `organizationId: null` and every scope.

### 3.2 Platforms — `GET /v1/platforms`  *(no scope required)*

The answer engines this deployment can track, so a client can build a model
filter without hardcoding strings.

```json
{ "data": [ { "id": "chatgpt", "label": "ChatGPT", "premiumCapable": true, "configured": true } ] }
```

### 3.3 Organizations

- `GET /v1/organizations` — `brands:read`. One entry for an org key; every org
  for an admin key.
- `GET /v1/organizations/{orgId}` — `brands:read`.
- `GET /v1/organizations/{orgId}/billing` — `billing:read`. **Read only, by
  construction.**

```json
{
  "organizationId": "acme",
  "billingEnabled": true,
  "plan": {
    "key": "pro", "name": "Pro", "status": "active", "standing": "active",
    "interval": "monthly", "periodEnd": "2026-09-01T00:00:00Z", "cancelAtPeriodEnd": false
  },
  "limits": {
    "maxBrands": 3, "maxPrompts": 200, "platformPicks": 4,
    "platformMenu": ["chatgpt", "perplexity", "…"],
    "standardRunsPerDay": 4, "premiumPool": 50, "premiumRunsPerDay": 1
  },
  "usage": { "brands": 2, "enabledPrompts": 140, "premiumPairingsAssigned": 12 }
}
```

Non-cloud deployments answer `200` with `billingEnabled: false`, `plan: null`,
and every `limits` field `null` — callers get one shape, no branching.

Never exposed: Stripe customer/subscription ids, payment methods, invoices,
`entitlementOverrides`. Anything a customer needs to *change* lives in the Stripe
portal.

### 3.4 Brands — extend

Existing `GET/POST /v1/brands`, `GET/PATCH /v1/brands/{brandId}` keep their exact
shapes, now scope-checked (`brands:read` / `brands:write`) and, for org keys,
filtered to the key's brands. Additions:

- `GET /v1/brands` gains `enabled` and `q` filters.
- The brand object gains `organizationId`, `enabledModels`, and
  `delayOverrideHours` (all already stored; additive fields).
- `POST /v1/brands` starts calling `assertCanCreateBrand`, so a cloud org key
  hits its brand limit here rather than creating an unbillable brand.
- **`POST /v1/brands` has to branch on key type.** Today it provisions a fresh
  organization named after the brand id (`ensureOrganization` in
  `apps/web/src/server/onboarding-core.ts`). That is right for an admin key
  standing up a tenant, and wrong for an org key — a key would escape its own
  tenancy on every create, and the new brand would be billed to nobody. An org
  key must create the brand *inside* its own organization, the way
  `createBrandInOrgFn` already does for the dashboard. This is the one place
  where the two key types cannot share a code path.
- **No** `DELETE /v1/brands/{brandId}`. Brand deletion cascades across runs,
  citations, and an organization; an irreversible cascade behind a leaked key is
  exactly the thing we would regret. Deletion stays a dashboard action.

### 3.5 Prompts — extend

`GET/POST /v1/prompts`, `GET/PATCH/DELETE /v1/prompts/{promptId}` unchanged,
scope-checked, org-filtered, with `limit` capped at 100. Additions:

- List filters: `enabled`, `tag` (repeatable), `q`.
- Prompt object gains `premiumModels`.
- `PATCH` accepts `premiumModels`, guarded by `assertCanAssignPremium`.
- `POST /v1/prompts/bulk` — create up to 100 prompts for one brand in a single
  call, entitlement-checked as one delta so a partial overrun can't slip past.
  Returns per-item results. This is the single most-requested shape in every
  comparable API (Profound's `POST /prompts`, Peec's per-project create).

### 3.6 Competitors — unchanged surface

`GET/POST /v1/competitors`, `GET/PATCH/DELETE /v1/competitors/{competitorId}`,
now scope-checked and org-filtered. `MAX_COMPETITORS` already applies.

### 3.7 Analytics — `/v1/brands/{brandId}/…`  *(`analytics:read`, all beta)*

Brand-nested rather than a `/reports/*` family, because `reports` already means
the one-shot generator in this product. Every endpoint takes the standard date
window plus optional `model` and `tags`.

| Endpoint | Returns |
| --- | --- |
| `GET …/summary` | The dashboard hero in one call: visibility, share of voice, totals for runs, prompts, citations. |
| `GET …/visibility` | Daily mention-rate series (0–100, `null` on days with no runs) + period totals. |
| `GET …/share-of-voice` | Brand vs. competitor leaderboard, brand share, and a daily share series. |
| `GET …/platforms` | Per-model visibility and run counts. |
| `GET …/citations/domains` | Cited domains with counts, category, and period-over-period change. Paginated. |
| `GET …/citations/urls` | Cited URLs with counts, titles, page type, and category. Paginated. |
| `GET …/query-fanout` | Sub-queries the engines ran: totals, coverage rate, and top queries. |
| `GET …/prompt-performance` | Per-prompt results over the window: run count, brand and competitor mention rates, last run. Paginated. Named apart from `/brands/{id}/prompts` so that path stays free if we ever want nested prompt CRUD. |

`GET /v1/prompts/{promptId}/snapshot` stays exactly as it is.

Every one of these is a thin route over a shared analytics function that the
dashboard's server function also calls, so the API physically cannot report
different numbers than the UI (see §5).

### 3.8 Runs — `runs:read`, beta

- `GET /v1/prompts/{promptId}/runs` — paginated run metadata: `id`, `model`,
  `provider`, `webSearchEnabled`, `brandMentioned`, `competitorsMentioned`,
  `webQueries`, `citationCount`, `createdAt`. **No answer text** — keeps the list
  payload bounded.
- `GET /v1/runs/{runId}` — one run, plus `answer: { text }` and the full
  `citations` array.

`answer.text` is the normalized extraction (`extractTextContent`), never the
provider's `rawOutput` blob. Exposing provider-shaped JSON would hand our
callers a contract we don't control.

### 3.9 Reports and tools — unchanged

`POST/GET /v1/reports`, `GET /v1/reports/{reportId}`, `POST /v1/tools/analyze`
keep their current behavior and remain **admin-only**: report generation and
brand analysis both spend provider budget with no org attribution today. Once
`usage_events` attribution covers them they can open up under `reports:write`.

---

## 4. Deliberately out of scope

| Left out | Why |
| --- | --- |
| Any billing write | Structural guarantee; no scope exists. |
| Org / member / invitation mutations | Already blocked at the middleware for every caller. |
| `DELETE /v1/brands/{id}` | Irreversible cascade; dashboard-only. |
| A `/v1/tags` resource | Tags are strings on prompts today. A tag resource would promise a model we don't have. |
| Opportunities reports | LLM-generated shape, still moving. |
| Raw `rawOutput` | Provider-shaped; would become our contract. |
| Cadence / scheduling internals | pg-boss detail; `delayOverrideHours` on the brand is the only knob worth exposing, and only for reading initially. |
| Cursor pagination, idempotency keys, webhooks | Real features, not blockers. Add when an integration needs one. |

---

## 5. Implementation sequence

Each step is independently shippable.

1. **Auth resolver.** `resolveApiAuth(request) → AdminAuth | OrgAuth | Failure`,
   scopes and brand narrowing included. `createApiHandler` becomes the single
   gate: it takes `requiredScopes`, resolves auth, enforces read-only, applies
   the rate limit, and hands handlers a `ctx.auth`. A conformance test asserts
   every route under `routes/api/v1` goes through it.
2. **Key management UI + schema.** better-auth `apiKey` plugin, the `apikey`
   table migration, and an org-scoped settings page: list, create (name, scopes,
   brand narrowing, expiry — secret shown once), revoke.
3. **Scope-check and org-filter the existing routes.** No response shapes change.
   Close the two enforcement gaps (`assertCanCreateBrand`, `limit` cap).
4. **Service layer (#331).** Extract `packages/lib/src/services/{brands,prompts,
   competitors}.ts` and an `analytics` module; make both the REST handlers and
   the server functions thin wrappers. Required before §3.7 — it is what
   guarantees the API and the dashboard compute the same numbers, and it is what
   a future MCP server (#105/#386) wraps instead of re-querying.
5. **Read surface.** `/v1/me`, `/v1/platforms`, `/v1/organizations*`, including
   billing.
6. **Analytics endpoints**, one shared analytics function each.
7. **Runs endpoints.**
8. **Prompt bulk create**, plus the additive list filters.
9. **Docs + SDK.** The docs site already renders whatever is not `planned`, so
   each step above publishes its own reference page by flipping its operations
   to `beta`. Then publish a typed client. Follow-up: derive `openapi.json` from
   the zod schemas rather than hand-editing (the second half of #331).

## 6. Testing

`e2e/bruno/` is the executable contract — one `.bru` per endpoint per outcome,
written before the implementation. Every case that depends on something not yet
built fails today; each step of §5 turns a block of them green.

**Identities.** Permission behavior can't be tested from one key, so `e2e/seed.ts`
seeds a matrix of them (`API_KEYS` in `e2e/fixtures.ts`): every scope, read
scopes only, a single scope, everything-but-`billing:read`, `analytics:read`
alone, the other tenant, a key narrowed to one brand of its own org, an expired
key, and a revoked one. They go straight into the `apikey` table — no session, no
key-management UI — and are skipped while that table doesn't exist, so the seeder
keeps working until organization keys land.

**Three runs, one collection.** Some rules only exist in one deployment mode,
so those cases are tagged and run in that mode's CI phase:

| Command | Mode | Covers |
| --- | --- | --- |
| `pnpm test:api` | local | everything untagged |
| `pnpm test:api:cloud` | cloud | plan enforcement, which exists nowhere else |
| `pnpm test:api:demo` | demo | read-only mode refusing every write |

The cloud fixtures are two extra tenants: one on a custom plan with
deliberately tiny limits (config-only, no Stripe), one with no subscription at
all.

**What every endpoint is checked for.** Happy path and response shape;
validation failures; missing and invalid key; missing scope; cross-tenant access
(byte-identical to not-found); a brand restriction narrowing a key inside its
own org; and — where a limit applies — the plan denial, that an admin key
bypasses it, and that a rejected batch created nothing.

Playwright covers the key-management UI; the entitlement decision tables stay
unit-tested where they already are.
