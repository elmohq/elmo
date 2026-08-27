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

Issued from the dashboard (`Settings → API keys`), backed by the
`@better-auth/api-key` plugin — a **separate package** from `better-auth`, which
dropped the plugin from core in 1.6. Keys look like `elmo_…`, are hashed at rest
with a prefix kept for display, take an optional expiry and a per-key rate
limit, and are never usable as an app session (`enableSessionForAPIKeys`
defaults off).

The plugin is configured with **`references: "organization"`**, which is the
whole reason to use it rather than roll our own: `apikey.referenceId` *is* the
organization id, and the plugin refuses to create a key for an organization the
calling user isn't a member of — checking, per org role, an `apiKey` statement
we add to the access control in `packages/lib/src/auth/permissions.ts`. Tenancy
is enforced by the library, not by us trusting a field.

| What | Stored in | Client-writable? |
| --- | --- | --- |
| The organization the key acts inside | `referenceId` | No — set by the plugin from a membership check |
| Scopes (§1.3) | `permissions` (`{ resource: [action] }`) | No — the plugin rejects it as a server-only property on any request carrying headers |
| `brandIds`, an optional narrowing to a subset of that org's brands | `metadata` | **Yes** |

**`metadata` is client-writable, so nothing in it may ever grant.** `brandIds`
lives there and is only ever *intersected* with the organization's brands, so
the worst a forged value can do is hand a key everything inside the organization
it is already bound to — which whoever could forge it already reaches. Anything
that widens a key's reach lives in `referenceId` or `permissions`, both of which
the plugin protects.

Because `permissions` is server-only, **key creation is a server function**, not
a browser call to the plugin: it validates `brandIds ⊆ the org's brands`, then
calls `auth.api.createApiKey` in-process. `/api/auth/api-key/create` and
`/update` are blocked over HTTP the same way organization mutations already are
(`evaluateDeploymentPolicy`), so the server function is the only way to mint one.
A browser that reached the endpoint anyway would get a key with no scopes, which
is the right failure.

Effective access = `permissions` ∩ (the `referenceId` org's brands, narrowed by
`metadata.brandIds`). No stored authorization can go stale: brands that leave
the org drop out of the key's reach on the next request.

**Keys belong to the organization, not to the person who made one.** Any org
member with the `apiKey` permission can see and revoke every key in it, and the
key survives its creator leaving — or being deleted, since `referenceId` points
at the organization and not at a user row. The alternative — user-owned keys
whose reach is re-derived from live membership — is stricter on offboarding but
silently breaks integrations when someone changes teams, grows a key's reach
when its owner joins another org, and leaves "which org is this billable to?"
ambiguous.

> **Decision point.** If we would rather keys die with their creator, drop
> `references: "organization"` back to the default `"user"` and intersect with
> live membership in the resolver. Nothing in the surface below moves.

### 1.3 Scopes

```
brands:read        brands:write
prompts:read       prompts:write       prompts:delete
competitors:read   competitors:write   competitors:delete
analytics:read
runs:read
billing:read
```

- `runs:read` is separate from `analytics:read` because raw model answers are
  bulkier and more sensitive than aggregates.
- `billing:read` is opt-in and has **no `:write` counterpart** — that is the
  structural guarantee that the API cannot touch billing, not a policy check
  somewhere that could be forgotten.
- **Destructive verbs get their own scope** where one exists. Deleting a prompt
  cascades its runs and citations; a reporting integration that syncs prompts
  has no business erasing history. Splitting `:delete` out costs one scope now
  and is impossible to add later without breaking every key that holds
  `:write`.
- There is deliberately **no `reports:*`**. Report generation and brand analysis
  spend provider budget immediately, with no organization to attribute it to —
  the `reports` table has no org column at all — so they stay admin-only (§3.9)
  rather than being reachable with a scope we'd then have to take back.
- The UI offers presets ("Read-only", "Full access") that expand to scope sets.
  The wire format is always the explicit list, so a preset's meaning can change
  without silently widening existing keys.

Missing scope → `403 insufficient_scope`, naming the scope required. Missing key
→ `401`. A key that resolves but whose org doesn't contain the target brand →
`404`, worded identically to a brand that doesn't exist, so a key can't probe
for other tenants.

**One deliberate exception.** Brand ids are globally unique, so creating a brand
whose id another tenant already took has to fail — an existence oracle the 404
rule can't cover. It answers `409` worded as availability
(`Brand id "acme" is not available.`) rather than existence, which leaks that an
id is taken and nothing about who took it. Accepted: the alternative is
tenant-scoped brand ids, a schema change with no other motivation.

### 1.4 Limits and enforcement

| Concern                | Admin key                        | Organization key                          |
| ---------------------- | -------------------------------- | ----------------------------------------- |
| Scopes                 | holds every scope                | only what it was issued                   |
| Cross-org access       | yes                              | never                                     |
| Plan entitlements      | the target org's, same as anyone | the same `assert*` guards the dashboard calls |
| Read-only (demo) mode  | blocked on writes                | blocked on writes                         |
| Request rate limit     | none                             | per-key, default 120/min, `X-RateLimit-*` + `429` (see below) |

The rate limit is the plugin's: a fixed window counted with a read-modify-write
per request, so under concurrency it is approximate. `X-RateLimit-Remaining` is
a guide, not a ledger — clients should back off on `429` rather than trying to
ride the number to zero. Say so in the docs rather than implying a precision the
counter doesn't have.

**An admin key is not exempt from a customer's plan.** It bypasses tenancy and
scopes — that is what makes it an operator key — but a limit protects the
organization's billing, not the caller, and an operator writing past one would
create a resource the worker's run policy then refuses to sample. This is also
what already happens: `POST /api/v1/prompts` calls `assertCanAddPrompts` with no
regard for who is asking. The lever for raising a customer's ceiling is
`entitlement_overrides`, which already exists and is config-only. Outside cloud
the question never arises: entitlements resolve to unlimited.

Cloud plan limits are already centralized in `@workspace/lib/entitlements`;
the API's job is to make sure every write path calls them. What each write
spends:

| Write | Guard |
| --- | --- |
| `POST /v1/brands` | `assertCanCreateBrand` |
| `POST /v1/prompts` | `assertCanAddPrompts` |
| `POST /v1/prompts/bulk` | `assertPromptSaveAllowed` — one decision for the whole batch, against both pools it can spend |
| `PATCH /v1/prompts/{id}` — `enabled` and/or `premiumModels` | `assertPromptSaveAllowed` with the net delta |
| `POST /v1/competitors` | `MAX_COMPETITORS`, already enforced |

Three gaps to close:

- `POST /v1/brands` does not currently call `assertCanCreateBrand`.
- **Re-enabling a prompt re-spends its premium pairings without checking them.**
  `PATCH` with `enabled: false → true` calls only `assertCanAddPrompts`, but
  `countOrgAssignedPremiumSlots` counts pairings on *enabled* prompts — so a
  prompt disabled with two premium models, then re-enabled, silently takes two
  pairings back out of a pool that may no longer have them. That is why the
  table above routes the whole of `PATCH` through `assertPromptSaveAllowed`,
  which decides both pools against one snapshot, rather than through the
  single-limit asserts.
- `GET /v1/prompts` clamps `limit` to a minimum but not a maximum. It gains a
  maximum of 100, **clamped rather than rejected**, matching `/brands` — an
  existing caller asking for 1000 keeps working and gets 100.

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

**Filtering.** One spelling everywhere: `model` takes a single platform id,
`tags` takes a comma-separated list and matches a resource carrying any of them.
Unknown query params are ignored; unknown body fields are stripped.

**Errors.** The existing `{ error, message }` envelope gains an optional stable
machine code:

```json
{ "error": "Conflict", "message": "Your plan tracks up to 200 prompts…", "code": "prompt_limit" }
```

`code` values: `unauthorized`, `insufficient_scope`, `forbidden`, `not_found`,
`validation_error`, `conflict`, `rate_limited`, `read_only`, `no_active_plan`,
`brand_limit`, `prompt_limit`, `platform_not_in_plan`, `platform_picks_exceeded`,
`premium_not_in_plan`, `premium_pool_exhausted`, `cadence_faster_than_plan`,
`internal_error`.

Adding a value is not a breaking change, so `code` is **not** an `enum` in the
spec — a generated client would turn one into a closed type that throws on the
first value we add. It is a documented string; clients treat an unrecognized
code as its HTTP status implies.

The entitlement codes are the same list `EntitlementDenialCode` already carries
internally, respelled: that enum is hyphenated (`prompt-limit`), the wire is
snake_case (`prompt_limit`) like every other code here. One explicit mapping at
the edge, so neither side has to bend — but it does have to be written, not
assumed: emitting `err.code` straight from the handler ships the wrong spelling.

**Scopes in the spec.** Each operation declares what it needs in
`x-elmo-scopes`. OpenAPI 3.0 only allows a non-empty scope list on `oauth2` and
`openIdConnect` schemes — writing scopes into the `security` array of a plain
bearer scheme produces an invalid document — so the requirement is carried as an
extension and summarized in the API description.

**Stability.** Every operation carries
`x-elmo-stability: stable | beta | planned`.

- `stable` — everything shipped today. Additive changes only.
- `beta` — built and supported, shape may still move. Concretely: we may add,
  rename, or remove a response field, or tighten a parameter, and we will say so
  in the changelog for the release that does it — but we won't change a path or
  a status code, and we won't do it silently. This is the main lever against
  locking ourselves in: new endpoints land here, not at `stable`.
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
  "createdBy": "Dana",
  "lastUsedAt": "2026-08-26T11:04:00Z",
  "expiresAt": null,
  "rateLimit": { "limit": 120, "window": "minute" },
  "deployment": { "mode": "cloud", "billingEnabled": true, "readOnly": false }
}
```

`brandIds` is **`null` when the key reaches every brand in its organization**
and a non-empty list when it is narrowed. An empty array is rejected at
creation: `[]` meaning "everything" is the kind of default that fails open, and
a key restricted to no brands is not a thing anyone means to make.

Admin keys answer `keyType: "admin"` with `organizationId: null` and every
scope.

### 3.2 Platforms — `GET /v1/platforms`  *(no scope required)*

The answer engines this deployment can track, so a client can build a model
filter without hardcoding strings.

```json
{ "data": [ { "id": "chatgpt", "label": "ChatGPT", "premiumCapable": true, "configured": true } ] }
```

### 3.3 Organizations

- `GET /v1/organizations` — no scope. One entry for an org key; every org for an
  admin key.
- `GET /v1/organizations/{orgId}` — no scope.
- `GET /v1/organizations/{orgId}/billing` — `billing:read`. **Read only, by
  construction.**

The first two need no scope because an org key can only ever see the
organization it is already bound to, and its name and brand count tell a caller
nothing it couldn't get from `/me`. Gating them behind `brands:read` would only
mean an analytics-only key can't name the workspace its numbers belong to.

```json
{
  "organizationId": "acme",
  "billingEnabled": true,
  "plan": {
    "key": "pro", "name": "Pro", "standing": "active", "trackingActive": true,
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

`standing` is ours (`active` / `grace` / `paused` / `none`) and says the only
thing a caller acts on: whether tracking is running and whether writes will be
accepted. The payment provider's own `status` string is deliberately **not**
passed through — it would make a foreign vocabulary part of our contract
forever, it says nothing `standing` doesn't, and it has no honest value at all
for an org on a custom plan, which has no subscription row behind it.

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
- **`POST /v1/brands` needs an owning organization before it needs a limit
  check.** Today `createBrand` hardcodes `organizationId: input.id` and
  provisions a fresh organization per brand (`ensureOrganization` in
  `apps/web/src/server/onboarding-core.ts`). That is right for an admin key
  standing up a tenant and wrong in three ways for an org key: the brand lands
  outside the key's organization, so the key can't see what it just made; it is
  billed to nobody; and the nested prompts are entitlement-checked against that
  brand-new org, which on cloud has no subscription — so any brand created with
  prompts would `402`.

  The fix is org attachment, not the limit check:

  | Caller | Owning organization |
  | --- | --- |
  | Organization key | the key's own, always — the request can't name another |
  | Admin key | `organizationId` in the body when given; today's provisioning when not, so existing admin integrations are unchanged |

  `CreateBrandRequest` gains that optional `organizationId`, ignored for org
  keys. `assertCanCreateBrand` then runs against whichever org was resolved —
  it's the easy part, and it's meaningless until the attachment is right.
- **No** `DELETE /v1/brands/{brandId}`. Brand deletion cascades across runs,
  citations, and an organization; an irreversible cascade behind a leaked key is
  exactly the thing we would regret. Deletion stays a dashboard action.

### 3.5 Prompts — extend

`GET/POST /v1/prompts`, `GET/PATCH/DELETE /v1/prompts/{promptId}` unchanged,
scope-checked, org-filtered, with `limit` capped at 100. Additions:

- List filters: `enabled`, `tag` (repeatable), `q`.
- Prompt object gains `premiumModels`.
- `PATCH` accepts `premiumModels`. It and `enabled` are guarded together as one
  delta (§1.4) — they spend two different pools and a save can move both.
- `POST /v1/prompts/bulk` — create up to 100 prompts for one brand in one call.
  All-or-nothing: the batch is checked against the plan as a single delta and
  either every prompt is created or none is, so a batch that would overrun a
  limit can't leave the caller guessing how far it got. Every comparable API has
  this shape (Profound's `POST /prompts`, Peec's per-project create); the
  all-or-nothing part is what keeps it from becoming a partial-failure protocol
  we'd have to keep supporting.

### 3.6 Competitors — unchanged surface

`GET/POST /v1/competitors`, `GET/PATCH/DELETE /v1/competitors/{competitorId}`,
now scope-checked and org-filtered. `MAX_COMPETITORS` already applies.

### 3.7 Analytics — `/v1/brands/{brandId}/…`  *(`analytics:read`)*

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

### 3.8 Runs — `runs:read`

- `GET /v1/prompts/{promptId}/runs` — paginated run metadata: `id`, `model`,
  `provider`, `webSearchEnabled`, `brandMentioned`, `competitorsMentioned`,
  `webQueries`, `citationCount`, `createdAt`. **No answer text** — keeps the list
  payload bounded.
- `GET /v1/runs/{runId}` — one run, plus `answer: { text }` and the full
  `citations` array.

`answer.text` is the normalized extraction (`extractTextContent`), never the
provider's `rawOutput` blob. Exposing provider-shaped JSON would hand our
callers a contract we don't control.

### 3.9 Reports and tools — unchanged, and admin-only

`POST/GET /v1/reports`, `GET /v1/reports/{reportId}`, and `POST /v1/tools/analyze`
keep their exact current behavior and are reachable **only with an admin key**.
No scope grants them; they carry `x-elmo-admin-only` in the spec instead of an
`x-elmo-scopes` list, so there is nothing to accidentally include in a preset.

Two reasons, and the second is the harder one:

- Both spend provider budget the moment they're called, and neither writes a
  `usage_events` row. Every other cost in the system is metered per organization
  and, if it exceeds the plan, simply isn't sampled by the worker. These two have
  no such backstop.
- `reports` has **no organization column** (`packages/lib/src/db/schema.ts`).
  There is no org to scope a report to, so "an org key may read its own reports"
  is not a thing that can be implemented, only approximated.

Opening them up means giving reports an owning organization and attributing
their spend. Until then, admin-only is the honest answer rather than a scope we
would have to take back.

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
| The payment provider's raw subscription `status` | `standing` says what a caller acts on; passing the provider's vocabulary through would make it ours forever. |

---

## 5. Implementation sequence

Each step is independently shippable.

1. **Auth resolver.** `resolveApiAuth(request) → AdminAuth | OrgAuth | Failure`,
   scopes and brand narrowing included. `createApiHandler` becomes the single
   gate: it takes `requiredScopes`, resolves auth, enforces read-only, applies
   the rate limit, and hands handlers a `ctx.auth`.

   This means **removing an existing gate**, which is the risky part.
   `deploymentMiddleware` currently 401s every `/api/v1` bearer that isn't in
   `ADMIN_API_KEYS`, before any route runs — and it can't do the database lookup
   an organization key needs, because it's a pure synchronous policy function.
   Once it stops rejecting unknown bearers, the only thing between a new route
   and no authentication at all is the conformance test asserting every file
   under `routes/api/v1` goes through `createApiHandler`. Write that test
   *first*, and loosen the middleware in the same commit that lands
   handler-side auth — not before.

2. **Key issuance + schema.** Add `@better-auth/api-key` (a new dependency,
   subject to the workspace's release-age cooldown), configure it with
   `references: "organization"`, add an `apiKey` statement to the org access
   control so roles decide who may mint and revoke, regenerate `schema-auth.ts`
   (`pnpm run generate:auth-schema`) and write the migration. Block
   `/api/auth/api-key/create` and `/update` over HTTP. Add the server function
   that validates `brandIds` and calls `auth.api.createApiKey` in-process. Then
   the settings page: list, create (name, scopes, brand narrowing, expiry —
   secret shown once), revoke.

3. **Scope-check and org-filter the existing routes.** No response shapes change.
   Close the three enforcement gaps (§1.4) — the brand-creation one is org
   attachment (§3.4), not a one-line guard.
4. **Service layer (#331).** Extract `packages/lib/src/services/{brands,prompts,
   competitors}.ts` and an `analytics` module; make both the REST handlers and
   the server functions thin wrappers. Required before §3.7 — it is what
   guarantees the API and the dashboard compute the same numbers, and it is what
   a future MCP server (#105/#386) wraps instead of re-querying. This is the
   biggest step by some margin: the analytics half means moving
   `apps/web/src/lib/postgres-read.ts` (~1,400 lines) into `packages/lib`.
5. **Read surface.** `/v1/me`, `/v1/platforms`, `/v1/organizations*`, including
   billing.
6. **Analytics endpoints**, one shared analytics function each.
7. **Runs endpoints.**
8. **Prompt bulk create**, plus the additive list filters.
9. **Docs + SDK.** The docs site already renders whatever is not `planned`, so
   each step above publishes its own reference page by flipping its operations
   to `beta`. Then publish a typed client. Follow-up: derive `openapi.json` from
   the zod schemas rather than hand-editing (the second half of #331).

### Open PRs this supersedes

Both are open against `main` and conflict with the above. Neither should merge
as-is.

- **#403 — per-user dashboard API keys.** The auth work, one design generation
  earlier: keys owned by a user, reach re-derived from live membership, and a
  boolean `readOnly` flag instead of scopes. Step 1 and step 2 replace it. The
  parts worth keeping are its shape, not its model: the single-gate
  `createApiHandler`, the route-conformance test, and the settings page.
- **#408 — `GET /brands/{id}/visibility`.** The right endpoint with the wrong
  parameter names: it takes `from`/`to`, this spec takes
  `startDate`/`endDate`/`lookback` to match the snapshot endpoint already
  public. Merging it as-is ships a second date-window spelling we would then be
  stuck with. Rebase it onto the settled convention, or fold it into step 6.

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
