/**
 * Shared E2E fixture constants — the single place the seeder, auth setup, and
 * Playwright specs agree on IDs and credentials. Unlike seed.ts this module
 * has no side effects, so specs can import from it freely.
 */
import path from "node:path";

/** Directory this file lives in, so paths don't depend on the caller's cwd. */
const E2E_DIR = import.meta.dirname;

// Defaults to localhost so the destructive seeder can never point at a
// production database. The env override lets CI workflows pass their own
// credentials (e.g. `elmo`/`elmo` for the scheduling-policy job's postgres
// service) — the first one to set DATABASE_URL in a given step wins.
export const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/elmo";

// Must match ADMIN_API_KEYS in the CI-patched .env (.github/workflows/e2e.yaml)
// and bruno/environments/local.bru.
export const TEST_API_KEY = "test-api-key-e2e";

export const TEST_USER = {
  email: "e2e@test.local",
  password: "e2e-test-password-123",
  name: "E2E Test User",
} as const;

export const TEST_BRAND_ID = "default";
export const TEST_BRAND_NAME = "Test Organization";
export const TEST_BRAND_WEBSITE = "https://example.com";

export const PROMPT_IDS = {
  branded1: "00000000-0000-0000-0000-000000000001",
  branded2: "00000000-0000-0000-0000-000000000002",
  unbranded1: "00000000-0000-0000-0000-000000000003",
  branded3: "00000000-0000-0000-0000-000000000004",
  unbranded2: "00000000-0000-0000-0000-000000000005",
} as const;

export const COMPETITOR_IDS = {
  competitorA: "00000000-0000-0000-0000-100000000001",
  competitorB: "00000000-0000-0000-0000-100000000002",
} as const;

export const REPORT_IDS = {
  completed: "00000000-0000-0000-0000-300000000001",
  pending: "00000000-0000-0000-0000-300000000002",
  processing: "00000000-0000-0000-0000-300000000003",
  failed: "00000000-0000-0000-0000-300000000004",
} as const;

// Second tenant — a brand in an org the E2E user is NOT a member of.
export const NIKE_ORG_ID = "nike";
export const NIKE_BRAND_ID = "nike";
/**
 * A second brand inside the Nike org, so a key narrowed to one brand of an org
 * it fully belongs to has something to be narrowed *away* from. Deliberately in
 * the tenant the E2E user can't see, so no dashboard spec's brand list changes.
 */
export const NIKE_SECOND_BRAND_ID = "nike-jordan";
export const NIKE_PROMPT_IDS = {
  training: "00000000-0000-0000-0000-400000000001",
  lifestyle: "00000000-0000-0000-0000-400000000002",
} as const;
export const NIKE_COMPETITOR_IDS = {
  adidas: "00000000-0000-0000-0000-410000000001",
  puma: "00000000-0000-0000-0000-410000000002",
} as const;

// ---------------------------------------------------------------------------
// Billing fixtures (only meaningful when the stack runs in cloud mode)
// ---------------------------------------------------------------------------

/**
 * An org on a custom plan with deliberately tiny limits, so a write can be
 * pushed past one without seeding hundreds of rows. Custom plans are
 * config-only (`organization_settings.entitlement_overrides`), so this needs no
 * Stripe subscription.
 */
export const CAPPED_ORG_ID = "capped";
export const CAPPED_BRAND_ID = "capped";
export const CAPPED_ENTITLEMENT_OVERRIDES = {
  planOverride: "custom",
  maxBrands: 1,
  maxPrompts: 6,
  premiumPoolIncluded: 0,
} as const;
/** Seeded enabled prompts, one short of CAPPED_ENTITLEMENT_OVERRIDES.maxPrompts. */
export const CAPPED_PROMPT_COUNT = 5;

/** An org with no subscription at all: reads work, every write is a 402. */
export const UNPAID_ORG_ID = "unpaid";
export const UNPAID_BRAND_ID = "unpaid";

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

/**
 * The organization keys the Bruno suite authenticates as, one per access
 * pattern the API has to get right. Seeded directly into the `apikey` table
 * (see seed.ts) rather than minted over HTTP, so the suite doesn't depend on a
 * session or on the key-management UI existing yet.
 *
 * `scopes` mirrors what better-auth stores in `apikey.permissions`
 * (`{ resource: [action] }`); the wire format the API reports is
 * `resource:action`.
 */
export const API_SCOPES = [
  "brands:read",
  "brands:write",
  "prompts:read",
  "prompts:write",
  "prompts:delete",
  "competitors:read",
  "competitors:write",
  "competitors:delete",
  "analytics:read",
  "runs:read",
  "billing:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const READ_SCOPES = API_SCOPES.filter((scope) => scope.endsWith(":read"));

/** Everything short of destroying data — the preset most integrations want. */
export const NON_DESTRUCTIVE_SCOPES = API_SCOPES.filter((scope) => !scope.endsWith(":delete"));

export interface ApiKeyFixture {
  /** The plaintext token a request sends. Hashed on the way into the table. */
  token: string;
  name: string;
  organizationId: string;
  scopes: readonly ApiScope[];
  /** Null means every brand in the organization. An empty array is never valid. */
  brandIds: readonly string[] | null;
  enabled?: boolean;
  /** Milliseconds from seed time; negative for an already-expired key. */
  expiresInMs?: number;
}

export const API_KEYS = {
  /** Everything the default tenant can do. The default identity for happy paths. */
  orgFull: {
    token: "elmo_e2e_org_full",
    name: "E2E org key (full)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  /** Every read scope and no write scope: writes must 403, reads must succeed. */
  orgReadOnly: {
    token: "elmo_e2e_org_readonly",
    name: "E2E org key (read-only)",
    organizationId: TEST_BRAND_ID,
    scopes: READ_SCOPES,
    brandIds: null,
  },
  /** Only brands:read — every other resource must 403 on missing scope. */
  orgBrandsOnly: {
    token: "elmo_e2e_org_brands_only",
    name: "E2E org key (brands only)",
    organizationId: TEST_BRAND_ID,
    scopes: ["brands:read"],
    brandIds: null,
  },
  /** Every scope but the destructive ones: writes succeed, deletes must 403. */
  orgNoDelete: {
    token: "elmo_e2e_org_no_delete",
    name: "E2E org key (no delete)",
    organizationId: TEST_BRAND_ID,
    scopes: NON_DESTRUCTIVE_SCOPES,
    brandIds: null,
  },
  /**
   * Only analytics:read. Proves the analytics endpoints stand on their own
   * scope, and that a key without brands:read can't reach the org endpoints.
   */
  orgAnalyticsOnly: {
    token: "elmo_e2e_org_analytics_only",
    name: "E2E org key (analytics only)",
    organizationId: TEST_BRAND_ID,
    scopes: ["analytics:read"],
    brandIds: null,
  },
  /** Full access except billing:read, so the billing endpoint must 403. */
  orgNoBilling: {
    token: "elmo_e2e_org_no_billing",
    name: "E2E org key (no billing)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES.filter((scope) => scope !== "billing:read"),
    brandIds: null,
  },
  /** The other tenant. Must never see anything belonging to the default org. */
  nikeFull: {
    token: "elmo_e2e_nike_full",
    name: "E2E Nike key (full)",
    organizationId: NIKE_ORG_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  /**
   * Nike's org, narrowed to one of its two brands. Proves a restriction narrows
   * a key below what its organization would otherwise reach.
   */
  nikeNarrow: {
    token: "elmo_e2e_nike_narrow",
    name: "E2E Nike key (one brand)",
    organizationId: NIKE_ORG_ID,
    scopes: API_SCOPES,
    brandIds: [NIKE_BRAND_ID],
  },
  /** Past its expiry: must 401 exactly like an unknown key. */
  expired: {
    token: "elmo_e2e_expired",
    name: "E2E org key (expired)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
    expiresInMs: -60_000,
  },
  /** Cloud only: an org one prompt short of a custom plan's limit. */
  capped: {
    token: "elmo_e2e_capped",
    name: "E2E capped key",
    organizationId: CAPPED_ORG_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  /** Cloud only: an org with no subscription. Reads work, writes are 402. */
  unpaid: {
    token: "elmo_e2e_unpaid",
    name: "E2E unpaid key",
    organizationId: UNPAID_ORG_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  /** Revoked: must 401 exactly like an unknown key. */
  disabled: {
    token: "elmo_e2e_disabled",
    name: "E2E org key (revoked)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
    enabled: false,
  },
} as const satisfies Record<string, ApiKeyFixture>;

// ---------------------------------------------------------------------------
// Deployment modes
// ---------------------------------------------------------------------------

/**
 * The deployment modes the E2E suite covers. Each one is a Playwright project
 * that runs the shared specs plus its own; the stack serves one mode at a time,
 * so CI recreates the web container between them (see e2e/modes/*.yaml).
 */
export const DEPLOYMENT_MODES = ["local", "cloud", "whitelabel", "demo"] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

export function isDeploymentMode(value: string): value is DeploymentMode {
  return (DEPLOYMENT_MODES as readonly string[]).includes(value);
}

/** Where each mode's authenticated browser state is saved by auth.setup.ts. */
export function authStatePath(mode: DeploymentMode): string {
  return path.join(E2E_DIR, ".auth", `${mode}.json`);
}

/**
 * The generated deployment config `elmo init --dev` writes. Read for the
 * BETTER_AUTH_SECRET the whitelabel setup needs to mint a session cookie.
 */
export const GENERATED_ENV_PATH = path.join(E2E_DIR, ".elmo", ".env");

/**
 * Whitelabel branding, mirroring e2e/modes/whitelabel.yaml. Kept here so specs
 * assert against the same values the container is configured with.
 */
export const WHITELABEL = {
  appName: "Acme AI Search",
  appIcon: "https://cdn.example.test/acme-icon.png",
  parentName: "Acme",
  optimizationUrlOrigin: "https://app.example.test",
  /** Bogus by design: no E2E run may reach a real identity provider. */
  auth0Domain: "e2e-idp.example.test",
  auth0ClientId: "e2e-auth0-client-id",
} as const;

/**
 * Cloud signup fixtures, mirroring CLOUD_SIGNUP_ALLOWLIST in
 * e2e/modes/cloud.yaml. The allowlist admits `allowedDomain` and the disposable
 * domain, so the disposable-address rejection is reached on its own merits
 * rather than being masked by the invite-only gate.
 */
export const CLOUD_SIGNUP = {
  allowedDomain: "e2e-allowed.test",
  blockedDomain: "e2e-blocked.test",
  disposableDomain: "mailinator.com",
} as const;

/** The shared credentials a demo deployment advertises on its login page. */
export const DEMO_CREDENTIALS = {
  email: "demo@elmohq.com",
  password: "demo",
} as const;
