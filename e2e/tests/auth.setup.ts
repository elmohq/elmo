/**
 * Per-mode authentication setup.
 *
 * Runs as the `<mode>:setup` Playwright project and saves browser state the
 * matching `<mode>` project reuses, so every spec starts as an authenticated
 * admin of the seeded brand. How the session is obtained differs by mode
 * because the deployments genuinely differ:
 *
 *   local       — bootstrap signup (the one signup a local instance allows)
 *   cloud       — self-serve signup + email verification, then sign-in
 *   demo        — sign-in only; signup is disabled and every write is refused
 *   whitelabel  — SSO-only, so the session is written directly (see session.ts)
 *
 * Whichever path runs, the user ends up an admin of TEST_BRAND_ID with report
 * generator access, so shared specs see the same surface in every mode.
 */
import { test as setup } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { authStatePath, isDeploymentMode, TEST_USER, type DeploymentMode } from "../fixtures";
import {
  assertSessionAccepted,
  ensureActiveCloudPlan,
  ensureOrgMembership,
  ensureUser,
  issueSessionCookie,
  sessionCookie,
  userExists,
  withDb,
} from "../session";

setup("authenticate", async ({ page, baseURL }, testInfo) => {
  const mode = testInfo.project.name.replace(/:setup$/, "");
  if (!isDeploymentMode(mode)) {
    throw new Error(`Setup project "${testInfo.project.name}" does not name a deployment mode`);
  }

  if (mode === "whitelabel") {
    // No password login to go through: create the account Auth0 would have
    // synced, then mint its session.
    await authenticateWithSeededSession(page, baseURL!, await ensureAdminOfSeededBrand());
  } else {
    await authenticateWithPassword(page.request, mode);
  }

  await assertSessionAccepted(page.request, TEST_USER.email);
  await page.context().storageState({ path: authStatePath(mode) });
  console.log(`[auth.setup] ${mode}: authenticated as ${TEST_USER.email}`);
});

/** Every mode's specs assume this: an admin of the seeded brand. */
async function ensureAdminOfSeededBrand(mode?: DeploymentMode): Promise<string> {
  return withDb(async (client) => {
    const userId = await ensureUser(client, TEST_USER);
    await ensureOrgMembership(client, userId);
    if (mode === "cloud") await ensureActiveCloudPlan(client);
    return userId;
  });
}

/**
 * local, cloud, and demo all expose email/password. Register the account if it
 * doesn't exist yet — in local that is the bootstrap signup, in cloud it is
 * ordinary self-serve signup — then grant it admin and sign in.
 *
 * Cloud refuses sign-in until the address is verified, so we mark it verified
 * directly rather than putting a real transactional-email provider in the loop.
 *
 * The sign-in comes last on purpose. better-auth caches the session's user
 * fields in a cookie for five minutes, so a session opened before the admin
 * role was granted would keep reporting the old role for the whole run.
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
    // A demo deployment has no signup at all — it is pointed at a database
    // some earlier local install bootstrapped, which is what the local phase
    // does in CI.
    throw new Error(
      `[auth.setup] demo: no account for ${TEST_USER.email}. ` +
        `Demo has no signup — bootstrap the account by running the local project first.`,
    );
  }

  const response = await request.post("/api/auth/sign-up/email", {
    data: { email: TEST_USER.email, password: TEST_USER.password, name: TEST_USER.name },
    failOnStatusCode: false,
  });

  // Local's signup hook creates the account and then provisions the "default"
  // org with a plain INSERT. The seeder has already created that org, so the
  // hook hits a duplicate key and the response is a 500 even though the account
  // now exists. Only that outcome is tolerated — anything that leaves no
  // account behind is still a failure.
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
 * Whitelabel has no password login at all — real users arrive through Auth0.
 * Standing up an OIDC provider for CI would test the identity provider more
 * than it tests Elmo, so the session is minted directly and injected. The SSO
 * entry point itself is covered by the whitelabel specs.
 */
async function authenticateWithSeededSession(page: Page, baseURL: string, userId: string): Promise<void> {
  const cookie = await issueSessionCookie(userId);
  await page.context().addCookies([sessionCookie(cookie, baseURL)]);
}
