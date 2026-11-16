/** IDs and credentials the seeder, auth setup and specs share. Unlike seed.ts, importing this has no side effects. */
import path from "node:path";

const E2E_DIR = import.meta.dirname;

// Always localhost, so the destructive seeder can never point at a production
// database.
function databaseUrl(name: string): string {
  return `postgres://postgres:postgres@localhost:5432/${name}`;
}

// CI jobs with their own postgres service override this.
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
  branded1: "00000000-0000-4000-8000-000000000001",
  branded2: "00000000-0000-4000-8000-000000000002",
  unbranded1: "00000000-0000-4000-8000-000000000003",
  branded3: "00000000-0000-4000-8000-000000000004",
  unbranded2: "00000000-0000-4000-8000-000000000005",
} as const;

export const COMPETITOR_IDS = {
  competitorA: "00000000-0000-4000-8000-100000000001",
  competitorB: "00000000-0000-4000-8000-100000000002",
} as const;

export const REPORT_IDS = {
  completed: "00000000-0000-4000-8000-300000000001",
  pending: "00000000-0000-4000-8000-300000000002",
  processing: "00000000-0000-4000-8000-300000000003",
  failed: "00000000-0000-4000-8000-300000000004",
} as const;

// A tenant the E2E user is not a member of.
export const NIKE_ORG_ID = "nike";
export const NIKE_BRAND_ID = "nike";
/** In the tenant the E2E user cannot see, so no dashboard spec's list changes. */
export const NIKE_SECOND_BRAND_ID = "nike-jordan";
export const NIKE_PROMPT_IDS = {
  training: "00000000-0000-4000-8000-400000000001",
  lifestyle: "00000000-0000-4000-8000-400000000002",
} as const;
export const NIKE_COMPETITOR_IDS = {
  adidas: "00000000-0000-4000-8000-410000000001",
  puma: "00000000-0000-4000-8000-410000000002",
} as const;

/** Tiny limits, so a write can exceed one without seeding hundreds of rows. */
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

export const API_SCOPES = ["read", "write"] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKeyFixture {
  token: string;
  name: string;
  organizationId: string;
  scopes: readonly ApiScope[];
  brandIds: readonly string[] | null;
  enabled?: boolean;
  expiresInMs?: number;
}

/** One key per access pattern, seeded straight into `apikey` so the suite needs no session. */
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
    scopes: ["read"],
    brandIds: null,
  },
  orgNoScopes: {
    token: "elmo_e2e_org_no_scopes",
    name: "E2E org key (no scopes)",
    organizationId: TEST_BRAND_ID,
    scopes: [],
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

/**
 * What e2e/modes.yaml publishes: one container per mode. Cloud signs accounts up
 * and deletes them, so it gets a database of its own. Demo shares local's on
 * purpose: it has no signup and is read-only, so it signs in with the account
 * local bootstrapped, as the public demo is deployed.
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

export function modeDatabaseUrl(mode: DeploymentMode): string {
  return databaseUrl(MODE_STACKS[mode].database);
}

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

/** Written by `elmo init --dev`; whitelabel setup reads its BETTER_AUTH_SECRET to mint a session cookie. */
export const GENERATED_ENV_PATH = path.join(E2E_DIR, ".elmo", ".env");

/** Mirrors `web-whitelabel` in e2e/modes.yaml. */
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
 * Mirrors CLOUD_SIGNUP_ALLOWLIST in e2e/modes.yaml, which also admits the
 * disposable domain so its rejection isn't masked by the invite-only gate.
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
