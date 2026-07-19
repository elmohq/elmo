/**
 * Shared E2E fixture constants — the single place the seeder, auth setup, and
 * Playwright specs agree on IDs and credentials. Unlike seed.ts this module
 * has no side effects, so specs can import from it freely.
 */

// Hardcoded to localhost so the destructive seeder can never point at a
// production database.
export const DATABASE_URL = "postgres://postgres:postgres@localhost:5432/elmo";

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
export const NIKE_PROMPT_IDS = {
  training: "00000000-0000-0000-0000-400000000001",
  lifestyle: "00000000-0000-0000-0000-400000000002",
} as const;
export const NIKE_COMPETITOR_IDS = {
  adidas: "00000000-0000-0000-0000-410000000001",
  puma: "00000000-0000-0000-0000-410000000002",
} as const;
