/**
 * Whitelabel is SSO-only, so rather than stand up an OIDC server its setup
 * writes a session row and hands the browser the cookie better-auth would have
 * set. Callers check it with `assertSessionAccepted`, so a change in
 * better-auth's cookie format fails setup clearly instead of as a wall of
 * login redirects.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { type APIRequestContext, test } from "@playwright/test";
import { hashPassword } from "@better-auth/utils/password";
import pg from "pg";
import {
  DATABASE_URL,
  GENERATED_ENV_PATH,
  TEST_BRAND_ID,
  TEST_BRAND_NAME,
  isDeploymentMode,
  modeDatabaseUrl,
} from "./fixtures";

/** better-auth's session cookie name on a non-HTTPS base URL. */
const SESSION_COOKIE_NAME = "better-auth.session_token";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The running project's own database; projects that name no mode, like `worker`, share local's. */
function currentDatabaseUrl(): string {
  const project = test.info().project.name.replace(/:setup$/, "");
  return isDeploymentMode(project) ? modeDatabaseUrl(project) : DATABASE_URL;
}

export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: currentDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function getBetterAuthSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET;
  if (fromEnv) return fromEnv;

  let contents: string;
  try {
    contents = fs.readFileSync(GENERATED_ENV_PATH, "utf8");
  } catch {
    throw new Error(
      `Cannot read BETTER_AUTH_SECRET: ${GENERATED_ENV_PATH} is missing. ` +
        `Run the elmo init step first, or set BETTER_AUTH_SECRET.`,
    );
  }

  const match = contents.match(/^BETTER_AUTH_SECRET=(.*)$/m);
  if (!match) throw new Error(`BETTER_AUTH_SECRET not found in ${GENERATED_ENV_PATH}`);
  return match[1].trim().replace(/^["']|["']$/g, "");
}

/** Mirrors better-auth's `makeSignature`: base64 HMAC-SHA256 of the value. */
function signSessionToken(token: string, secret: string): string {
  const signature = crypto.createHmac("sha256", secret).update(token).digest("base64");
  return `${token}.${signature}`;
}

export async function issueSessionCookie(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");

  await withDb(async (client) => {
    await client.query(
      `INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '7 days', NOW(), NOW())`,
      [token, userId],
    );
  });

  return signSessionToken(token, getBetterAuthSecret());
}

/** Cookie payload shaped for `browserContext.addCookies`. */
export function sessionCookie(value: string, baseURL: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    domain: new URL(baseURL).hostname,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
    expires: Math.floor((Date.now() + SESSION_TTL_MS) / 1000),
  };
}

/** Admin with report-generator access, so the sidebar's admin section is populated in every mode. */
export async function ensureUser(client: pg.Client, user: { email: string; name: string }): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO "user" (id, name, email, email_verified, role, has_report_generator_access, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, true, 'admin', true, NOW(), NOW())
     ON CONFLICT (email) DO UPDATE
       SET role = 'admin', has_report_generator_access = true, email_verified = true
     RETURNING id`,
    [user.name, user.email],
  );
  return rows[0].id;
}

export async function ensureDemoAccount(
  client: pg.Client,
  credentials: { email: string; password: string },
): Promise<string> {
  const userId = await ensureUser(client, { email: credentials.email, name: "Demo User" });
  await client.query(`DELETE FROM account WHERE user_id = $1 AND provider_id = 'credential'`, [userId]);
  await client.query(
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'credential', $1, $2, NOW(), NOW())`,
    [userId, await hashPassword(credentials.password)],
  );
  await ensureOrgMembership(client, userId);
  return userId;
}

/** Local's signup hook already does this; the other modes need it, and it picks up a renamed TEST_BRAND_NAME. */
export async function ensureOrgMembership(client: pg.Client, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO organization (id, name, slug, created_at)
     VALUES ($1, $2, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [TEST_BRAND_ID, TEST_BRAND_NAME],
  );

  const existing = await client.query(
    `SELECT id FROM member WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
    [TEST_BRAND_ID, userId],
  );
  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO member (id, organization_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'admin', NOW())`,
      [TEST_BRAND_ID, userId],
    );
  }
}

export async function ensureActiveCloudPlan(client: pg.Client): Promise<void> {
  await client.query(
    `INSERT INTO subscription
       (id, plan, reference_id, status, period_start, period_end, billing_interval)
     VALUES ('e2e-active-business-plan', 'business', $1, 'active', NOW(), NOW() + INTERVAL '30 days', 'monthly')
     ON CONFLICT (id) DO UPDATE SET
       plan = EXCLUDED.plan,
       reference_id = EXCLUDED.reference_id,
       status = EXCLUDED.status,
       period_start = EXCLUDED.period_start,
       period_end = EXCLUDED.period_end,
       billing_interval = EXCLUDED.billing_interval`,
    [TEST_BRAND_ID],
  );
}

/** So a spec that signs accounts up can be run again; their sessions and memberships cascade. */
export async function deleteUsers(emails: string[]): Promise<void> {
  await withDb(async (client) => {
    await client.query(`DELETE FROM "user" WHERE email = ANY($1::text[])`, [emails]);
  });
}

/** Rejected signups show a generic message, so specs assert no account was created rather than on wording. */
export async function userExists(email: string): Promise<boolean> {
  return withDb(async (client) => {
    const { rowCount } = await client.query(`SELECT 1 FROM "user" WHERE email = $1`, [email]);
    return (rowCount ?? 0) > 0;
  });
}

/** Mark an address verified without going through a transactional email. */
export async function verifyEmail(email: string): Promise<void> {
  await withDb(async (client) => {
    await client.query(`UPDATE "user" SET email_verified = true WHERE email = $1`, [email]);
  });
}

/**
 * The role check matters: better-auth caches user fields in the cookie for five
 * minutes, so a session opened before the admin grant would quietly hide the
 * admin section and /reports from every spec.
 */
export async function assertSessionAccepted(request: APIRequestContext, expectedEmail: string): Promise<void> {
  const response = await request.get("/api/auth/get-session");
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`Session check failed: ${response.status()} ${body}`);
  }

  let session: { user?: { email?: string; role?: string } } | null = null;
  try {
    session = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`Session check returned an unparseable body: ${body}`);
  }

  if (session?.user?.email !== expectedEmail) {
    throw new Error(`Session check did not return ${expectedEmail}. Body: ${body || "(empty)"}`);
  }
  if (session.user.role !== "admin") {
    throw new Error(`Session reports role "${session.user.role}", expected "admin" (stale session cookie cache?)`);
  }
}
