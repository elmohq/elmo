/** Saves the browser state each `<mode>` project reuses, so every spec starts as an admin of the seeded brand. */
import type { APIRequestContext, Page } from "@playwright/test";
import { authStatePath, DEMO_CREDENTIALS, isDeploymentMode, TEST_USER, type DeploymentMode } from "../fixtures";
import {
  assertSessionAccepted,
  ensureActiveCloudPlan,
  ensureDemoAccount,
  ensureOrgMembership,
  ensureUser,
  issueSessionCookie,
  sessionCookie,
  userExists,
  withDb,
} from "../session";
import { test as setup } from "../test";

setup("authenticate", async ({ page, baseURL }, testInfo) => {
  const mode = testInfo.project.name.replace(/:setup$/, "");
  if (!isDeploymentMode(mode)) {
    throw new Error(`Setup project "${testInfo.project.name}" does not name a deployment mode`);
  }

  if (mode === "whitelabel") {
    await authenticateWithSeededSession(page, baseURL!, await ensureAdminOfSeededBrand());
  } else {
    await authenticateWithPassword(page.request, mode);
  }

  if (mode === "demo") await withDb((client) => ensureDemoAccount(client, DEMO_CREDENTIALS));

  await assertSessionAccepted(page.request, TEST_USER.email);
  await page.context().storageState({ path: authStatePath(mode) });
  console.log(`[auth.setup] ${mode}: authenticated as ${TEST_USER.email}`);
});

async function ensureAdminOfSeededBrand(mode?: DeploymentMode): Promise<string> {
  return withDb(async (client) => {
    const userId = await ensureUser(client, TEST_USER);
    await ensureOrgMembership(client, userId);
    if (mode === "cloud") await ensureActiveCloudPlan(client);
    return userId;
  });
}

/**
 * Sign-in comes last because better-auth caches user fields in the session
 * cookie, so signing in before the admin grant would keep the old role all run.
 */
async function authenticateWithPassword(request: APIRequestContext, mode: DeploymentMode): Promise<void> {
  if (mode === "cloud") await markEmailVerified();
  if (!(await userExists(TEST_USER.email))) {
    await register(request, mode);
    await markEmailVerified();
  }

  await ensureAdminOfSeededBrand(mode);

  if (!(await signIn(request))) {
    throw new Error(`[auth.setup] ${mode}: sign-in failed for ${TEST_USER.email}`);
  }
}

async function register(request: APIRequestContext, mode: DeploymentMode): Promise<void> {
  if (mode === "demo") {
    throw new Error(
      `[auth.setup] demo: no account for ${TEST_USER.email}. ` +
        `Demo has no signup — bootstrap the account by running the local project first.`,
    );
  }

  const response = await request.post("/api/auth/sign-up/email", {
    data: { email: TEST_USER.email, password: TEST_USER.password, name: TEST_USER.name },
    failOnStatusCode: false,
  });

  // Local's signup hook 500s inserting the "default" org the seeder already
  // made, after the account is created. Only a failure that leaves no account
  // behind counts.
  if (!response.ok() && !(await userExists(TEST_USER.email))) {
    throw new Error(`[auth.setup] ${mode}: sign-up failed: ${response.status()} ${await response.text()}`);
  }
}

async function markEmailVerified(): Promise<void> {
  await withDb(async (client) => {
    await client.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [TEST_USER.email]);
  });
}

async function signIn(request: APIRequestContext): Promise<boolean> {
  const response = await request.post("/api/auth/sign-in/email", {
    data: { email: TEST_USER.email, password: TEST_USER.password },
    failOnStatusCode: false,
  });
  return response.ok();
}

/**
 * An OIDC provider in CI would test the identity provider more than Elmo, so
 * whitelabel's session is minted directly. The whitelabel specs cover the SSO
 * entry point.
 */
async function authenticateWithSeededSession(page: Page, baseURL: string, userId: string): Promise<void> {
  const cookie = await issueSessionCookie(userId);
  await page.context().addCookies([sessionCookie(cookie, baseURL)]);
}
