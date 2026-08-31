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

`ADMIN_API_KEYS` (comma-separated env var, timing-safe compared). Reaches every
organization and every endpoint, including the admin-only ones, and holds every
scope — it is the operator's key for an instance the operator owns. It is still
answerable to the plan of whichever organization it is writing into (§1.4).
Self-hosters keep using exactly what they use today.

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
prompts:read       prompts:write
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
- **Destructive verbs get their own scope** where one exists. Splitting
  `:delete` out costs one scope now and is impossible to add later without
  breaking every key that holds `:write`.
- **Deleting a prompt has no scope at all.** It cascades its runs and citations,
  and the dashboard offers no such action to anyone — so a scope for it would
  put an operation in the API that the product does not have. Disabling
  (`PATCH` with `enabled: false`) is the supported way to stop tracking a
  prompt: it keeps the history and frees the plan slot just the same. The verb
  stays reachable with an admin key, for an operator cleaning up an instance
  they own (§3.11).
- There is deliberately **no `reports:*`**. Report generation and brand analysis
  spend provider budget immediately, with no organization to attribute it to —
  the `reports` table has no org column at all — so they stay admin-only (§3.11)
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
| Request rate limit     | none                             | per-key, default 1,000/min, `X-RateLimit-*` + `429` (see below) |

The rate limit is deliberately generous: it is there to stop a runaway loop from
saturating the database, not to meter normal use. A nightly analytics pull over
ten brands costs under a hundred requests; exporting a brand's answer text costs
one per run, which is hundreds of thousands for a large organization. A few hundred
per minute would turn that export into a day-long job — a limit shaping the
product rather than protecting it.

Two properties worth knowing. It is the plugin's fixed window, counted with a
read-modify-write per request, so under concurrency it is approximate —
`X-RateLimit-Remaining` is a guide to back off on, not a ledger to ride to zero.
And the limit is **stamped onto each key when it is created**, not read from
configuration per request, so raising the default does nothing for keys already
issued. There is no way to change an issued key's limit short of reissuing it.

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

The two limits with no write path — a brand's model picks
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

**List envelopes.** Every list answers `{ data: [...], pagination: {...} }`.

The lists that shipped before this also still carry their original key —
`brands`, `prompts`, `competitors`, `reports` — holding the same array. That is
a migration, not a permanent split: there is one known consumer, so the old keys
are marked `deprecated` in the spec, `data` is documented as the field to read,
and a later release removes them. Both are emitted unconditionally, so both stay
`required` while the old one lives.

**Filtering.** One spelling everywhere: `model` takes a single model id,
`tags` takes a comma-separated list and matches a resource carrying any of them.
Unknown query params are ignored; unknown body fields are stripped.

**Errors.** The existing `{ error, message }` envelope gains an optional stable
machine code:

```json
{ "error": "Conflict", "message": "Your plan tracks up to 200 prompts…", "code": "prompt_limit" }
```

`code` values: `unauthorized`, `insufficient_scope`, `forbidden`, `not_found`,
`validation_error`, `conflict`, `rate_limited`, `method_not_allowed`, `read_only`,
`no_active_plan`,
`brand_limit`, `prompt_limit`, `model_not_in_plan`, `model_picks_exceeded`,
`premium_not_in_plan`, `premium_pool_exhausted`, `cadence_faster_than_plan`,
`system_tag_immutable`, `internal_error`.

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

**Stability.** An operation whose response shape may still change carries
`x-stability: experimental` and says so in the first line of its description,
where a reader actually looks. Everything else is stable: its shape will only
ever gain fields.

The absence of the marker is the promise, which is why there is one value and
not a ladder — a tier that means "probably fine" is a tier nobody acts on. Today
exactly one operation carries it: Opportunities, whose shape is LLM-generated
and still moving. Marking it is what makes exposing it reasonable at all.

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
  "rateLimit": { "limit": 1000, "window": "minute" }
}
```

It describes the *key*, and nothing else. An earlier draft also reported the
deployment's mode, whether billing was on, and whether it was read-only. That
is the operator's configuration, not the tenant's: a customer's integration has
no decision to make with it, `GET /organizations/{id}/billing` already answers
"do plan limits apply here" for the one organization that asks, and a write
refused in read-only mode says so in its own `403`. Publishing it made every
instance's posture readable by anyone holding any key, forever.

`brandIds` is **`null` when the key reaches every brand in its organization**
and a non-empty list when it is narrowed. An empty array is rejected at
creation: `[]` meaning "everything" is the kind of default that fails open, and
a key restricted to no brands is not a thing anyone means to make.

Admin keys answer `keyType: "admin"` with `organizationId: null` and every
scope.

### 3.2 Models — `GET /v1/models`  *(no scope required)*

The answer engines this deployment can track, so a client can build a model
filter without hardcoding strings.

```json
{ "data": [ { "id": "chatgpt", "label": "ChatGPT", "premiumCapable": true, "configured": true } ] }
```

**One word for an answer engine, and it is "model."** The codebase currently has
three: the plan config and the picker call one a *platform*
(`platformPicks`, `platformMenu`), every database column and every filter calls
it a *model*, and `SCRAPE_TARGETS` calls the tuple of model-plus-provider-plus-
version a *target*. Two of those are worth keeping — a target is genuinely a
different thing from the engine it reaches — but *platform* and *model* are the
same thing said twice, and a caller who reads `GET /platforms` and then filters
by `?model=` has been handed the confusion.

Nothing published before this used either word as a field name, so the API
settles on **model** at no cost: the resource, the filter, the per-engine rows,
the plan limits (`modelPicks`, `modelMenu`), and the entitlement error codes.
*Target* keeps its meaning and stays operator-facing. The internal `platform*`
names in `packages/config/src/plans.ts` and the picker components are a separate
rename with no user-visible payoff, and are deliberately left alone.

### 3.3 Organizations

- `GET /v1/organizations` — no scope. One entry for an org key; every org for an
  admin key.
- `GET /v1/organizations/{orgId}` — no scope.
- `GET /v1/organizations/{orgId}/billing` — `billing:read`. **Read only, by
  construction.**

The first two need no scope because an org key can only ever see the
organization it is already bound to, and its name and brand count tell a caller
nothing it couldn't get from `/me`. Gating them behind `brands:read` would only
mean an analytics-only key can't name the organization its numbers belong to.

```json
{
  "organizationId": "acme",
  "billingEnabled": true,
  "plan": {
    "key": "pro", "name": "Pro", "standing": "active", "trackingActive": true,
    "interval": "monthly", "periodEnd": "2026-09-01T00:00:00Z", "cancelAtPeriodEnd": false
  },
  "limits": {
    "maxBrands": 3, "maxPrompts": 200, "modelPicks": 4,
    "modelMenu": ["chatgpt", "perplexity", "…"],
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

  The fix is org attachment, not the limit check. `CreateBrandRequest` gains an
  optional `organizationId`, read four ways:

  | Caller | `organizationId` omitted | `organizationId` present |
  | --- | --- | --- |
  | Organization key | creates in the key's own organization | must name the key's own organization; any other value is a `400` |
  | Admin key | provisions a new organization named after the brand id, exactly as it does today | creates in the named organization, which must already exist — `404` if it does not |

  An organization key naming its own organization is fine — a client filling the
  field in from `GET /me` shouldn't be punished for it — but naming another is a
  mistake worth reporting rather than silently ignoring.

  The admin row's bottom-left cell is worth naming: **omitting the field on an
  admin key is currently the only way to create an organization over the API.**
  There is no organization endpoint that writes. That is a side effect rather
  than a design, and it is the reason the admin key's other cell insists the
  named organization already exists: a typo that quietly provisioned a tenant
  would be the same operation with none of the intent.

  `assertCanCreateBrand` then runs against whichever org was resolved — it's the
  easy part, and it's meaningless until the attachment is right.
- **`enabled` on `PATCH /v1/brands/{brandId}` is admin-only.** The field
  predates this and was unreachable without an admin key, because no other kind
  of key existed. Setting it `false` is what the worker's scheduler reads to
  stop sampling a brand altogether, so an organization key could end a
  customer's tracking silently while the plan kept being billed — and no
  dashboard control does it at any role, so the API would have been strictly
  more permissive than the product. Setting it with an organization key is a
  `403` rather than being ignored, so a caller who meant it learns the field did
  nothing. Everything else in the body stays writable with `brands:write`.
- **No** `DELETE /v1/brands/{brandId}`. Brand deletion cascades across runs,
  citations, and an organization; an irreversible cascade behind a leaked key is
  exactly the thing we would regret. Nothing in the product deletes a brand
  today — not the dashboard either — so the API adding one would be inventing
  the operation, not exposing it.

### 3.5 Prompts — extend

`GET/POST /v1/prompts` and `GET/PATCH /v1/prompts/{promptId}` unchanged,
scope-checked, org-filtered, with `limit` capped at 100.
`DELETE /v1/prompts/{promptId}` keeps its exact behaviour and becomes
**admin-only** (§1.3, §3.11). Additions:

- List filters: `enabled`, `tag` (repeatable), `q`.
- Prompt object gains `premiumModels`.
- `PATCH` accepts `premiumModels`. It and `enabled` are guarded together as one
  delta (§1.4) — they spend two different pools and a save can move both.
**No bulk create.** An earlier draft added `POST /v1/prompts/bulk` alongside the
single create, which immediately produced the problem two endpoints for one
operation always produce: they drifted. Bulk accepted `enabled` and
`premiumModels`; the shipped single create did not, so what a caller could set
depended on how many prompts they were creating. And the two spent the plan
through different guards.

The alternative — one endpoint accepting either a prompt or a list — costs a
response shape that changes with the request, which is a union return type in
every generated client. So neither: `POST /v1/prompts` creates one prompt, and a
caller creating fifty calls it fifty times. That is a real cost at the margins
(fifty round trips, and a partial failure the caller has to reconcile), and it
is the one option that adds no surface we would have to keep. If batch creation
turns out to matter, it comes back as a deliberate addition rather than as a
second way to do what already works.

### 3.6 Competitors — unchanged surface

`GET/POST /v1/competitors`, `GET/PATCH/DELETE /v1/competitors/{competitorId}`,
now scope-checked and org-filtered. `MAX_COMPETITORS` already applies.

### 3.7 Tags — `prompts:read` / `prompts:write`

- `GET /v1/brands/{brandId}/tags` — every tag in use on the brand's prompts,
  with how many carry each.
- `PATCH /v1/brands/{brandId}/tags/{tag}` — rename it across the brand.
  Renaming onto an existing tag merges them.
- `DELETE /v1/brands/{brandId}/tags/{tag}` — remove it from every prompt.

**Derived, not a resource.** There is no tag table: a tag is a string in
`prompts.tags`, and it exists exactly as long as some prompt carries it. These
endpoints are a view over that and a bulk edit of it — which is the whole reason
they're safe to add. A `POST /v1/tags` that created a tag nothing carries would
be promising a model we don't have, and we'd have to keep it.

What the list buys a caller is real: today, building the filter the dashboard
shows means paging every prompt in the brand and deduplicating client-side.

`branded` and `unbranded` are computed from the prompt text. They always appear
in the list, marked `system: true`, and cannot be renamed or removed
(`409 system_tag_immutable`) — applying one to a prompt as a user tag overrides
the computed classification, which is a prompt edit, not a tag edit.

Both mutations need `prompts:write`: they relabel prompts and destroy no tracked
data, and a caller with `prompts:write` could already do the same thing one
`PATCH /v1/prompts/{promptId}` at a time. Neither touches an entitlement pool —
a relabel changes no count.

### 3.8 Opportunities — `analytics:read`

`GET /v1/brands/{brandId}/opportunities` — the brand's latest Opportunities
report: prioritized ways to get cited more often, each with the tracked prompts
it targets and the pages already cited for them, plus a summary and the risks.

This is the one endpoint whose shape we are least sure of — it is LLM-generated
and still moving — which is exactly what `beta` is for. Shipping it labelled
beats withholding it: the analysis is the most useful thing in the product to
pipe somewhere else, and a caller who reads the label knows what they're
pinning.

**Generated inline, exactly as the dashboard generates it.** There is no job and
no queue: `resolveOpportunities` serves the stored report while it is fresh and
produces a new one when it isn't, and both the dashboard and this endpoint are
wrappers over it. So there is nothing for a caller to poll, no `processing`
status, and no way to be handed a report the dashboard would have replaced — at
the cost that the request which finds a stale report waits for the generation it
caused.

An earlier draft had the API read the newest stored row and never generate,
which meant a brand nobody had opened the dashboard for answered
`status: "not-generated"` forever — a state an API caller could neither cause
nor clear. Adding a `stale` flag to describe it was documenting the gap rather
than closing it.

The freshness window is the meter, which is what makes generating from a request
acceptable here when `/tools/analyze` and report generation are admin-only:
however many callers ask, at most one generation happens per brand per window.
There is still deliberately no `POST` — an explicit "regenerate now" has no such
gate.

`status` is `ready` or `insufficient-data`; the latter means the brand hasn't
accumulated enough tracked answers to say anything useful, and the lists are
empty.

### 3.9 Analytics — `/v1/brands/{brandId}/…`  *(`analytics:read`)*

Brand-nested rather than a `/reports/*` family, because `reports` already means
the one-shot generator in this product. Every endpoint takes the standard date
window plus optional `model` and `tags`.

**Units.** Every rate, share, and visibility figure here is an exact ratio in
`[0,1]`, unrounded — a client multiplies by 100 if it wants a percentage. The
alternative, whole-number percentages, throws away precision the computation
already has: at seven runs a brand moves in 14-point steps, and rounding makes
genuinely different values collide. It also forces a per-field note about
whether a given number is an integer percent or carries a decimal. One rule
with no exceptions is worth more than numbers that read nicely in a console.

The one number that is not a ratio is `CitationDomain.changeFactor`, which is a
multiplier against the previous window rather than a share: `2` is twice as many
citations, `0.5` is half, `1` is unchanged. It is deliberately not a percentage
change — "+150%" and "1.5x" are different numbers, and the multiplier is the one
that cannot be misread.

`GET /v1/reports/{id}` predates all of this and nothing here changes it. It
mixes both spellings and always has: the per-prompt `sov` under `prompts` is a
whole-number percentage, while everything under `unstable` is a 0–1 ratio. The
new endpoints have one rule because they could; that one keeps what it shipped
with.

| Endpoint | Returns |
| --- | --- |
| `GET …/analytics` | Visibility (headline + daily series), share of voice (brand share, leaderboard, daily series), per-model visibility and run counts, and the run/prompt/citation totals. |
| `GET …/citations/domains` | Cited domains with counts, category, and period-over-period change. Paginated. |
| `GET …/citations/urls` | Cited URLs with counts, titles, page type, and category. Paginated. |
| `GET …/query-fanout` | Sub-queries the engines ran: totals, coverage rate, and top queries. |
| `GET …/prompt-performance` | Per-prompt results over the window: run count, brand and competitor mention rates, last run. Paginated. Named apart from `/brands/{id}/prompts` so that path stays free if we ever want nested prompt CRUD. |

**One aggregate endpoint, not five.** The first draft had `summary`,
`visibility`, `share-of-voice` and `platforms` as separate operations, and every
scalar `summary` returned was already in one of the other three — while costing
all four computations to produce, including a full citation aggregation for a
single integer. Assembling one brand's picture meant four requests carrying an
identical window and filter set.

They are one endpoint now. There is deliberately **no `include` parameter**: the
four computations share a scope resolution and run concurrently, so selecting a
subset saves a caller a fraction of one request and costs every caller a
parameter to reason about and us a combinatorial response shape to document. The
things that can grow without bound — cited domains and URLs, sub-queries,
per-prompt rows — stay paginated endpoints of their own, because those are lists
and need `page`/`limit` of their own.

`GET /v1/prompts/{promptId}/snapshot` stays exactly as it is — including
`startDate`/`endDate` as the window spelling, which is why the endpoints above
use it too.

Every one of these is a thin route over a shared analytics function that the
dashboard's server function also calls, so the API physically cannot report
different numbers than the UI (see §5).

### 3.10 Runs — `runs:read`

- `GET /v1/prompts/{promptId}/runs` — paginated run metadata: `id`, `model`,
  `provider`, `webSearchEnabled`, `brandMentioned`, `competitorsMentioned`,
  `webQueries`, `citationCount`, `createdAt`. **No answer text** — keeps the list
  payload bounded.
- `GET /v1/prompts/{promptId}/runs/{runId}` — one run, plus `answer: { text }`
  and the full `citations` array.

**Nested, not a top-level `/v1/runs`.** A run is one answer to one prompt and
has no meaning apart from it; every way a caller arrives at a run id is by
listing that prompt's runs, so the prompt is always in hand. Nesting makes the
detail path the list path plus an id, which is the shape a reader guesses, and
it makes "this run belongs to that prompt" something the URL states and the
handler checks — a run addressed under the wrong prompt answers `404` rather
than quietly succeeding.

`answer.text` is the normalized extraction (`extractTextContent`), never the
provider's `rawOutput` blob. Exposing provider-shaped JSON would hand our
callers a contract we don't control.

### 3.11 Reports, tools, and prompt deletion — admin-only

`POST/GET /v1/reports`, `GET /v1/reports/{reportId}`, `POST /v1/tools/analyze`,
and `DELETE /v1/prompts/{promptId}` keep their exact current behavior and are
reachable **only with an admin key**. No scope grants them; they carry
`x-elmo-admin-only` in the spec and an empty `x-elmo-scopes`, so there is
nothing to accidentally include in a preset.

`DELETE /v1/prompts/{promptId}` is here for a different reason from the other
three: it spends nothing, but it destroys tracked history, and no user of the
dashboard can do it at any role. An API that is strictly more permissive than
the product is a surface nobody designed. Its `403` names the alternative —
`PATCH` with `enabled: false` — because the refusal is the one place an
integration that hit it is certainly reading.

For reports and tools, two reasons, and the second is the harder one:

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
| `DELETE /v1/brands/{id}` | Irreversible cascade, and no surface in the product performs it (§3.4). |
| Creating a tag that no prompt carries | Tags are derived from `prompts.tags`; a standalone tag would promise a table we don't have (§3.7). |
| Triggering an Opportunities generation | Spends provider budget with nothing metering it per call (§3.8). |
| Opportunities history | Only the latest report. The table is append-only, so a `generatedBefore` filter can be added the day someone wants one. |
| Raw `rawOutput` | Provider-shaped; would become our contract. |
| Cadence / scheduling internals | pg-boss detail; `delayOverrideHours` on the brand is the only knob worth exposing, and only for reading initially. |
| Cursor pagination, idempotency keys, webhooks | Real features, not blockers. Add when an integration needs one. |
| The payment provider's raw subscription `status` | `standing` says what a caller acts on; passing the provider's vocabulary through would make it ours forever. |

---

## 5. Implementation sequence

Each step is independently shippable. **Steps 1–9 are done**; what each one
turned out to involve is recorded below, including the parts the first draft of
this plan got wrong.

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

2. **Key issuance + schema.** `@better-auth/api-key` is pinned to `~1.6.29`,
   the line matching `better-auth`; `^` would resolve to 1.7, whose peer on
   `@better-auth/core` is a different copy of the same types, and plugin objects
   then stop being assignable to `BetterAuthPlugin`. One `overrides` anchor on
   `@better-auth/core` keeps a single copy in the store — two copies of one
   version are as incompatible as two versions.

   The `apikey` table comes from `pnpm run generate:auth-schema` like every
   other better-auth table. `/api/auth/api-key/create`, `/update`, and `/delete`
   are blocked over HTTP.

   Settings → API keys does the issuing, over server functions in
   `apps/web/src/server/api-keys.ts`. Creation calls `auth.api.createApiKey`
   with **no headers**: the plugin treats any request carrying them as a client
   request and refuses to set `permissions`, which is the guard that stops a
   browser minting a scoped key and the thing a genuine server-side call has to
   get past. Passing `userId` instead says what the call is; the plugin still
   runs its own membership and role check before creating anything. Only an
   owner or admin may issue or revoke.

3. **Scope-check and org-filter the existing routes.** Done, with one addition
   the plan didn't foresee: a verb no handler claimed fell through the file
   router to the SPA and answered `200` with HTML, so `PATCH` on a read-only
   resource looked like it had worked. `withMethodGuard` fills in the unclaimed
   verbs with a `405`, and the conformance test requires it on every route
   alongside `createApiHandler`.
4. **Service layer (#331).** The analytics half is done and wired both ways.
   `apps/web/src/server/analytics-core.ts` holds the computations as
   edge-agnostic functions — no session, no `Request` — and **both** surfaces
   are thin wrappers over it: `getFilteredVisibilityFn`, `getShareOfVoiceFn`,
   and `getQueryFanoutFn` on the dashboard side, the `/api/v1` routes on the
   other. `e2e/tests/shared/analytics-parity.spec.ts` reads a figure off the
   rendered page and asserts the API reports the same one, so a metric
   reimplemented on one side fails a test rather than shipping.

   Wiring the two together immediately turned up a real divergence: the core was
   summing the per-competitor query for the share-of-voice trend, where the
   dashboard reads the `competitor_mentions` column on the per-prompt row. Those
   count different things — mention instances versus per-prompt totals.

   **Still to do:** citations still has two implementations —
   `getCitationsFn` returns more than the API publishes (the Google module,
   what's-changed, page-type distribution), so folding them together is its own
   piece of work rather than a wrapper. Two implementations are acceptable; two
   *answers* are not, so `analytics-parity.spec.ts` pins the fields they both
   produce: the citation and unique-domain totals, every domain's count, and
   every URL's category — categorization being the likeliest place for two
   implementations to drift apart quietly. Moving the module into `packages/lib`
   (which means moving `apps/web/src/lib/postgres-read.ts`, ~1,400 lines, with
   it) is what a future MCP server (#105/#386) would wrap instead of
   re-querying. Same for the CRUD half: the REST handlers are thin, but they are
   thin over drizzle rather than over a shared service.
5. **Read surface.** `/v1/me`, `/v1/models`, `/v1/organizations*`, including
   billing.
6. **Analytics endpoints**, one shared analytics function each.
7. **Runs endpoints.**
8. **Tags and opportunities.** Both are thin: tags read and rewrite
   `prompts.tags`, opportunities reads the newest `brand_opportunities` row.
9. **Additive prompt list filters.** A bulk create shipped here first and was
   removed again; §3.5 records why.
10. **Docs + SDK.** Every operation is `beta` and rendered. **Still to do:**
   publish a typed client. Follow-up: derive `openapi.json` from
   the zod schemas rather than hand-editing (the second half of #331).

Until that generation exists, `e2e/validate-openapi.mjs` is what keeps the
hand-written spec honest: it replays the responses the Bruno runs recorded and
fails CI on any that the documented schema says are impossible. It also reports
fields documented as optional that were present in every response observed —
weaker evidence, so it prints rather than fails.

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
written before the implementation. **213 cases; all pass** except
`tools/analyze`, which calls a real provider and needs a key.

Two Playwright specs cover what Bruno structurally can't. The suite
authenticates as keys the seeder wrote straight into the table, which says
nothing about whether the product can mint one — `api-keys.spec.ts` creates one
through the page and checks it carries exactly the scopes ticked, is refused on
one it isn't, sees the other tenant as absent rather than forbidden, and stops
working the moment it is revoked. `analytics-parity.spec.ts` reads figures off the
rendered dashboard and asserts the API reports the same ones — including for
citations, which is the one metric still computed twice.

Two of them were worth nothing as first written: the API-key forgery cases
posted to `/api/auth/api-key/create` with no session, so they would have passed
with the endpoint wide open — a request with no session is refused for want of
one either way. They now sign in first and assert the block's own message, which
is what tells "we refused this" apart from "better-auth wanted a session".

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

**Two checks that hold the surface together.** Neither tests an endpoint; both
catch the class of mistake a per-endpoint test can't see, because the thing that
went wrong is the absence of something.

`v1-route-conformance.test.ts` imports every route and reads the handler map the
router will serve. Each handler carries a stamp only `createApiHandler` applies,
so a verb wired to anything else is visible — an earlier version read the source
for `createApiHandler(`, which a file could satisfy while exporting something
else entirely. It also compares the scopes each handler enforces against the
`x-elmo-scopes` its operation documents: a spec that asks for less than the route
wants sends callers to a 403 on an endpoint they were told their key covered, and
one that asks for more is documenting security that isn't there.

`e2e/validate-openapi.mjs` runs after the three Bruno phases and holds the
responses they recorded against the schema that documents them. A response the
spec calls impossible fails CI; a field documented optional that was present in
every response observed is reported, since one run can't prove it. It also lists
the operations no recorded response exercised, so its coverage doesn't read as
larger than it is.
