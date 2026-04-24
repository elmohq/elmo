# Plan: lock down auth surface & unify user/org/brand bootstrap

> Tracking doc for the demo-safety + local-mode-bootstrap refactor.
> This file is committed here so PR reviewers can read the reasoning,
> and will be deleted before the PR is squash-merged.

## Problem

Three deployment modes share an auth stack, but user/org/brand creation is
inconsistent and has at least one live bug plus one security hole:

- **Local mode is silently broken.** After `/auth/register` succeeds, no
  `member` row is ever created. `/app/default` then throws `notFound()`.
- **Demo mode has attack surface.** `/api/auth/sign-up/email` is reachable
  (`emailAndPasswordEnabled` defaults to `true`). `policies.ts` allow-lists
  `/api/auth/*` in read-only mode, so anyone can register a new demo account
  — and, via better-auth's `organization()` plugin, can probably create orgs
  too.
- **`DEFAULT_ORG_ID` / `DEFAULT_ORG_NAME`** are still required env vars
  (`packages/config/src/env.ts:127`) even though PR #206's goal is to remove
  them. The CLI writes them to every `.env` file for no functional reason.
- **Three inconsistent creation surfaces**: `elmo init` sets env defaults →
  `createLocalDeployment` claims a default org exists → `seed-auth.ts`
  (demo-only) actually creates it → UI register creates users but no org
  linkage. Nothing ties these together for local.

Whitelabel is fine — Auth0 SSO + `provisionUser` hook handles everything,
and signup is disabled. Don't touch except for belt-and-suspenders
tightening.

## Guiding principles

- **Server-side provisioning is the only path.** No mutation of
  users/orgs/members via `POST /api/auth/*`. Everything goes through code
  we control.
- **Mode-aware allowlist at the auth layer, not post-hoc blocks.** Disable
  endpoints at the better-auth config level so they don't exist, rather
  than relying solely on policy middleware.
- **Single source of truth** for "who can create what" — a new
  `provisioning.ts` module that the UI signup hook and seed scripts both
  call.
- **Whitelabel untouched** except to tighten its already-tight config.
- **No CLI bootstrap command.** First-user registration happens in the UI.
  A CLI bootstrap would be a second surface to keep in sync and isn't
  necessary given the hook-based lockout (see #3 below).

## Mode policy matrix (target state)

| Capability                                         | local                            | demo                       | whitelabel              |
| -------------------------------------------------- | -------------------------------- | -------------------------- | ----------------------- |
| Email/password sign-in                             | yes                              | yes (seeded user only)     | no                      |
| Email/password sign-up via API                     | **yes iff no users exist yet**   | no                         | no                      |
| Auth0 SSO                                          | no                               | no                         | yes                     |
| Better-auth org plugin mutation endpoints          | no                               | no                         | no                      |
| Org/membership created by server on signup         | yes (auto, first signup)         | no (only via seed script)  | yes (via Auth0 sync)    |
| Number of users                                    | 1                                | N (seeded)                 | N (SSO)                 |
| Number of orgs/brands per user                     | 1                                | N                          | N                       |
| Register page UI available                         | only before bootstrap            | never                      | never (already redirects) |

## End-to-end flow, local mode

1. User runs `elmo init` → `.env` written, stack starts. No
   `DEFAULT_ORG_ID`/`DEFAULT_ORG_NAME` in env anymore.
2. User visits `/auth/register`, enters **name, email, password, workspace
   name**.
3. `POST /api/auth/sign-up/email` → better-auth creates `user` row →
   `databaseHooks.user.create.after` fires → `provisioning.provisionLocalUser`
   creates `organization` (generated UUID, name = workspace name) and
   `member` (role=admin).
4. Before this hook commits, `databaseHooks.user.create.before` checks
   `provisioning.countUsers()`. If there's already a user, the signup is
   rejected. First-signup-only is enforced at the DB hook level, not via env
   flags.
5. UI redirects to `/app` → loader finds one org → redirects to
   `/app/<uuid>`.
6. `getBrandData` sees no `brands` row → `needsOnboarding: true`.
7. Existing `BrandOnboarding` component asks for website URL → calls
   existing `createBrandFn` → `brands` row created.
8. Existing onboarding wizard takes over. No changes to wizard logic or
   brand schema.

## End-to-end flow, demo mode

1. Deploy-time: `seed-auth.ts` runs, creating N demo users + orgs +
   memberships based on a JSON seed file. Refactored from current
   single-user demo seed.
2. Runtime: sign-up API rejected by `disableSignUp`. Sign-in works for
   seeded users only. All write endpoints blocked by existing `policies.ts`
   read-only guard. Better-auth org plugin mutation endpoints blocked.
3. Jared manages demo users by editing the seed file and re-running the
   seed script on the demo box. Not exposed as an HTTP endpoint.

## End-to-end flow, whitelabel

Unchanged. Add `disableSignUp: true` and `disableOrgMutations: true` flags
to `getWhitelabelAuthOptions` as defense in depth. Auth0 SSO continues to
drive user creation via `provisionUser`.

## Changes, in order

### 1. `packages/lib/src/db/provisioning.ts` (new)

Single module owning user-adjacent provisioning. Called by the web app
(via signup hook) and seed scripts. Not directly by the UI.

```ts
export async function countUsers(): Promise<number>;

export async function provisionLocalOrg(input: {
  userId: string;
  workspaceName: string;
}): Promise<{ orgId: string }>;

export async function provisionDemoUser(input: {
  email: string;
  password: string;
  name: string;
  orgId: string;
  orgName: string;
  isAdmin?: boolean;
  hasReportAccess?: boolean;
}): Promise<{ userId: string; orgId: string }>;
```

- All org/member writes go through this module. No other file inserts into
  `organization` or `member` tables (except whitelabel's existing
  `auth-sync.ts` which is already the server-side path for its flow).
- Transactional: org + member written atomically so a partial state can't
  leave a user without membership.

### 2. Lock down better-auth config in `packages/lib/src/auth/server.ts`

Extend `CreateAuthOptions`:

```ts
export interface CreateAuthOptions {
  // ...existing...
  /** Reject POST /api/auth/sign-up/email via better-auth's built-in option. */
  disableSignUp?: boolean;
  /** Install a databaseHooks.user.create.before that calls this guard; throws to reject. */
  signUpGuard?: () => Promise<void>;
  /** Install databaseHooks.user.create.after that runs this callback. */
  onUserCreated?: (user: { id: string; name: string | null }) => Promise<void>;
}
```

- Pass `disableSignUp` into `emailAndPassword.disableSignUp` (built-in
  better-auth option).
- `signUpGuard` and `onUserCreated` are the composition points for local
  mode's "first signup only, then create org" behavior. Whitelabel/demo
  don't use them.

### 3. Wire modes in `apps/web/src/lib/auth/server.ts`

```ts
switch (process.env.DEPLOYMENT_MODE) {
  case "whitelabel":
    return {
      ...getWhitelabelAuthOptions(),
      disableSignUp: true,
    };
  case "demo":
    return {
      minPasswordLength: 4,
      disableSignUp: true,
    };
  default: // local
    return {
      signUpGuard: async () => {
        if ((await countUsers()) > 0) {
          throw new Error("This instance is already bootstrapped.");
        }
      },
      onUserCreated: async (user) => {
        // Workspace name comes from the signup request body; stashed in
        // the user.name fallback if not provided.
        await provisionLocalOrg({
          userId: user.id,
          workspaceName: await readStashedWorkspaceName(),
        });
      },
    };
}
```

Getting the workspace name from the signup request requires threading it
through — either via a custom `additionalFields` declaration on the user
schema (simplest, better-auth supports it) or via a short-lived
AsyncLocalStorage. **Preferred approach:** add `workspaceName` as an
additional field on user that's `input: true` but then cleared by the
`onUserCreated` hook after reading it. Falls back cleanly if absent.

### 4. Block better-auth org plugin mutations in `apps/web/src/lib/auth/policies.ts`

Extend `evaluateDeploymentPolicy` with an unconditional block for
mutations against `/api/auth/organization/**`. Applies in all three modes —
orgs are server-managed everywhere.

```ts
const isOrgMutation =
  pathname.startsWith("/api/auth/organization/") && isWriteMethod;
if (isOrgMutation) {
  return { action: "block", status: 403, ... };
}
```

Add tests alongside existing policy tests for each mode.

### 5. Remove `DEFAULT_ORG_ID` / `DEFAULT_ORG_NAME`

- `packages/config/src/env.ts` — delete `LOCAL_DEMO_REQUIREMENTS` entries.
- `packages/local/src/auth-provider.ts` — delete `defaultOrganization`. The
  `/app/index.tsx` loader already handles `defaultOrgId === undefined` via
  "redirect to first available org".
- `apps/cli/src/index.ts` — delete the constants and env writes (three
  lines).
- `packages/lib/src/db/seed-auth.ts` — hardcode `"demo-org"` /
  `"Demo Organization"`; drop env lookups (already has these as fallbacks).
- `apps/web/src/env.d.ts` — remove the type declarations.
- `AGENTS.md` — remove from env var examples.

### 6. Register page changes in `apps/web/src/routes/auth/register.tsx`

- Add a `workspaceName` input field (required).
- Pass it to `authClient.signUp.email({ name, email, password, workspaceName })` via the extra-fields mechanism.
- Extend `ClientConfig` with `canRegister: boolean`; the route renders
  nothing / redirects to login when `canRegister === false`.
- Placement: between name and email fields. Label: "Workspace name", helper
  text: "This is what your workspace and first brand will be called."

### 7. `ClientConfig.canRegister`

- Computed server-side in `apps/web/src/server/config.ts` (wherever
  `clientConfig` is built). Value is `mode === "local" && (await countUsers()) === 0`.
- Cheap — indexed count. No caching for now; the check happens once per
  page-load of unauthenticated routes.
- `/auth/login` hides the "Create one" link when `canRegister === false`.

### 8. Demo seed refactor (`packages/lib/src/db/seed-auth.ts`)

- Accept an array of users from a JSON file path (env
  `DEMO_SEED_FILE`, default: committed `packages/lib/src/db/demo-seed.json`
  with the single current demo user).
- Each entry: `{ email, password, name, orgId, orgName, isAdmin?,
  hasReportAccess? }`.
- Calls `provisionDemoUser` for each. Idempotent.
- Docker compose: existing demo deployments already run `seed-auth.ts`
  post-migrate; no compose change required.

### 9. Tests

- **Unit** (`packages/lib/src/db/provisioning.test.ts`):
  `provisionLocalOrg` happy path; transactional failure rollback;
  `countUsers` accuracy.
- **Policy** (`apps/web/src/lib/auth/policies.test.ts`): add cases for
  `POST /api/auth/organization/create` rejected in all three modes;
  existing auth-endpoint allowlist unchanged.
- **E2E** (extend `e2e/auth-setup.ts`): first register succeeds in local;
  second register fails at both the UI (form hidden) and API (curl
  rejected); register always fails in demo.

### 10. Follow-ups noted but out of scope

- Syncing `organization.name` to `brands.name` when the user completes the
  brand-onboarding wizard — so the sidebar and switcher show the brand
  name, not the original workspace name. Small one-line add to
  `createBrandFn`, but not required for this PR's correctness.
- Rename UI on the org / brand surface once we care.
- Cloud mode.

## Rollout

One PR, squash-merged. Commit order inside the PR (for reviewability; all
squashed at merge):

1. This plan document (`PLAN-auth-bootstrap.md`) + changeset.
2. `provisioning.ts` + unit tests — pure addition.
3. `CreateAuthOptions` extension + policy block for org mutations.
4. Wire demo + whitelabel to `disableSignUp`, add org mutation tests.
5. Remove `DEFAULT_ORG_ID`/`DEFAULT_ORG_NAME` from config, CLI, local
   auth-provider, env.d.ts, AGENTS.md.
6. Local signup hook + register UI changes + `canRegister` clientConfig.
7. Demo seed multi-user refactor + seed JSON.
8. E2E test updates.
9. Delete `PLAN-auth-bootstrap.md`.
