/**
 * Shared E2E fixture constants — the single place the seeder, auth setup, and
 * Playwright specs agree on IDs and credentials. Unlike seed.ts this module
 * has no side effects, so specs can import from it freely.
 */
import path from "node:path";

/** Directory this file lives in, so paths don't depend on the caller's cwd. */
const E2E_DIR = import.meta.dirname;

// Always localhost, so the destructive seeder can never point at a production
// database.
function databaseUrl(name: string): string {
  return `postgres://postgres:postgres@localhost:5432/${name}`;
}

// The env override lets CI workflows pass their own credentials (e.g.
// `elmo`/`elmo` for the scheduling-policy job's postgres service) — the first
// one to set DATABASE_URL in a given step wins.
export const DATABASE_URL = process.env.DATABASE_URL ?? databaseUrl("elmo");

// Must match ADMIN_API_KEYS in the CI-patched .env (.github/workflows/e2e.yaml)
// and bruno/environments/local.bru.
export const TEST_API_KEY = "test-api-key-e2e";

export const TEST_USER = {
  email: "e2e@test.local",
  password: "e2e-test-password-123",
  name: "E2E Test User",
} as const;

export const TEST_BRAND_ID = "default";
export const TEST_ORG_SLUG = "default";

export function organizationUrl(org: string = TEST_ORG_SLUG): string {
  return `/app/org/${org}`;
}

export function brandUrl(brand: string = TEST_BRAND_ID, org: string = TEST_ORG_SLUG): string {
  return `${organizationUrl(org)}/brand/${brand}`;
}
export const TEST_BRAND_NAME = "Test Organization";

export const TEST_ORGANIZATION_NAME = TEST_BRAND_NAME;

export const SLUGGED_BRAND_ID = "seeded-slug-brand";
export const SLUGGED_BRAND_SLUG = "labs";
export const SLUGGED_BRAND_NAME = "Test Labs";

export const RENAMEABLE_BRAND_ID = "seeded-rename-brand";
export const RENAMEABLE_BRAND_SLUG = "rename-me";
export const RENAMEABLE_BRAND_NAME = "Test Rename";
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
/** In the tenant the E2E user cannot see, so no dashboard spec's list changes. */
export const NIKE_SECOND_BRAND_ID = "nike-jordan";
export const NIKE_PROMPT_IDS = {
  training: "00000000-0000-0000-0000-400000000001",
  lifestyle: "00000000-0000-0000-0000-400000000002",
} as const;
export const NIKE_COMPETITOR_IDS = {
  adidas: "00000000-0000-0000-0000-410000000001",
  puma: "00000000-0000-0000-0000-410000000002",
} as const;

/** Tiny limits, so a write can be pushed past one without seeding hundreds of
 * rows. Config-only, so no Stripe subscription is needed. */
export const CAPPED_ORG_ID = "capped";
export const CAPPED_BRAND_ID = "capped";
export const CAPPED_ENTITLEMENT_OVERRIDES = {
  planOverride: "custom",
  maxBrands: 1,
  maxPrompts: 6,
  premiumPoolIncluded: 0,
} as const;
export const CAPPED_PROMPT_COUNT = 5;

export const UNPAID_ORG_ID = "unpaid";
export const UNPAID_BRAND_ID = "unpaid";

/** One key per access pattern, seeded straight into `apikey` so the suite needs
 * no session. */
export const API_SCOPES = [
  "brands:read",
  "brands:write",
  "prompts:read",
  "prompts:write",
  "competitors:read",
  "competitors:write",
  "competitors:delete",
  "analytics:read",
  "runs:read",
  "billing:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const READ_SCOPES = API_SCOPES.filter((scope) => scope.endsWith(":read"));

export const NON_DESTRUCTIVE_SCOPES = API_SCOPES.filter((scope) => !scope.endsWith(":delete"));


export interface ApiKeyFixture {
  token: string;
  name: string;
  organizationId: string;
  scopes: readonly ApiScope[];
  brandIds: readonly string[] | null;
  enabled?: boolean;
  expiresInMs?: number;
}

export const API_KEYS = {
  orgFull: {
    token: "elmo_e2e_org_full",
    name: "E2E org key (full)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  orgReadOnly: {
    token: "elmo_e2e_org_readonly",
    name: "E2E org key (read-only)",
    organizationId: TEST_BRAND_ID,
    scopes: READ_SCOPES,
    brandIds: null,
  },
  orgBrandsOnly: {
    token: "elmo_e2e_org_brands_only",
    name: "E2E org key (brands only)",
    organizationId: TEST_BRAND_ID,
    scopes: ["brands:read"],
    brandIds: null,
  },
  orgNoScopes: {
    token: "elmo_e2e_org_no_scopes",
    name: "E2E org key (no scopes)",
    organizationId: TEST_BRAND_ID,
    scopes: [],
    brandIds: null,
  },
  orgNoDelete: {
    token: "elmo_e2e_org_no_delete",
    name: "E2E org key (no delete)",
    organizationId: TEST_BRAND_ID,
    scopes: NON_DESTRUCTIVE_SCOPES,
    brandIds: null,
  },
  orgAnalyticsOnly: {
    token: "elmo_e2e_org_analytics_only",
    name: "E2E org key (analytics only)",
    organizationId: TEST_BRAND_ID,
    scopes: ["analytics:read"],
    brandIds: null,
  },
  orgNoBilling: {
    token: "elmo_e2e_org_no_billing",
    name: "E2E org key (no billing)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES.filter((scope) => scope !== "billing:read"),
    brandIds: null,
  },
  /** What a forged restriction looks like: the intersection empties it. */
  orgForgedRestriction: {
    token: "elmo_e2e_org_forged_restriction",
    name: "E2E org key (forged restriction)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: [NIKE_BRAND_ID],
  },
  nikeFull: {
    token: "elmo_e2e_nike_full",
    name: "E2E Nike key (full)",
    organizationId: NIKE_ORG_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  nikeNarrow: {
    token: "elmo_e2e_nike_narrow",
    name: "E2E Nike key (one brand)",
    organizationId: NIKE_ORG_ID,
    scopes: API_SCOPES,
    brandIds: [NIKE_BRAND_ID],
  },
  expired: {
    token: "elmo_e2e_expired",
    name: "E2E org key (expired)",
    organizationId: TEST_BRAND_ID,
    scopes: API_SCOPES,
    brandIds: null,
    expiresInMs: -60_000,
  },
  capped: {
    token: "elmo_e2e_capped",
    name: "E2E capped key",
    organizationId: CAPPED_ORG_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
  unpaid: {
    token: "elmo_e2e_unpaid",
    name: "E2E unpaid key",
    organizationId: UNPAID_ORG_ID,
    scopes: API_SCOPES,
    brandIds: null,
  },
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
 * that runs the shared specs plus its own.
 *
 * A container serves one mode for its lifetime, so the stack runs one per mode
 * (see e2e/modes.yaml) rather than recreating a single container between
 * phases. The ports and databases here are what that file publishes.
 *
 * Cloud and whitelabel get a database of their own. Cloud signs accounts up and
 * deletes them again, so on one shared database every phase had to re-seed to
 * undo the phase before it, and the order they ran in was load-bearing.
 *
 * Local and demo share one on purpose: demo has no signup, so the account its
 * specs sign in with has to be the one the local phase bootstrapped, and demo
 * is READ_ONLY so it cannot write back. That mirrors how the public demo is
 * deployed, and is the one ordering the workflow still keeps.
 */
const MODE_STACKS = {
  local: { port: 1515, database: "elmo" },
  cloud: { port: 1516, database: "elmo_cloud" },
  whitelabel: { port: 1517, database: "elmo_whitelabel" },
  demo: { port: 1518, database: "elmo" },
} as const;

export const DEPLOYMENT_MODES = ["local", "cloud", "whitelabel", "demo"] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

/** Where a mode's stack answers. `BASE_URL` overrides it for a one-off run. */
export function modeUrl(mode: DeploymentMode): string {
  return process.env.BASE_URL ?? `http://localhost:${MODE_STACKS[mode].port}`;
}

/** The database a mode's container writes to, which is where a spec checking
 * whether a write landed has to look. */
export function modeDatabaseUrl(mode: DeploymentMode): string {
  return databaseUrl(MODE_STACKS[mode].database);
}

/** Every database the stack seeds, each named once however many modes read it. */
export function seededDatabaseUrls(): string[] {
  return [...new Set(DEPLOYMENT_MODES.map(modeDatabaseUrl))];
}

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
 * Whitelabel branding, mirroring `web-whitelabel` in e2e/modes.yaml. Kept here
 * so specs assert against the same values the container is configured with.
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
 * Cloud signup fixtures, mirroring CLOUD_SIGNUP_ALLOWLIST in e2e/modes.yaml.
 * The allowlist admits `allowedDomain` and the disposable domain, so the
 * disposable-address rejection is reached on its own merits rather than being
 * masked by the invite-only gate.
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
