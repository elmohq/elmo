/**
 * Database-level helpers for establishing an authenticated E2E session.
 *
 * Most modes sign in over HTTP, but whitelabel is SSO-only — better-auth has
 * email/password disabled there, so the only way into the app is an identity
 * provider. Rather than stand up an OIDC server, the whitelabel setup writes a
 * session row and hands the browser the cookie better-auth would have set.
 *
 * The cookie format is better-auth's: `<token>.<signature>`, where the
 * signature is a base64 HMAC-SHA256 of the token under BETTER_AUTH_SECRET (see
 * `makeSignature` in better-auth's crypto module). Callers must verify the
 * cookie is actually accepted — `assertSessionAccepted` below — so a change in
 * that format fails setup with a clear message instead of surfacing as a wall
 * of "redirected to /auth/login" test failures.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import type { APIRequestContext } from "@playwright/test";
import pg from "pg";
import { DATABASE_URL, GENERATED_ENV_PATH, TEST_BRAND_ID, TEST_BRAND_NAME } from "./fixtures";

/** better-auth's session cookie name on a non-HTTPS base URL. */
const SESSION_COOKIE_NAME = "better-auth.session_token";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * BETTER_AUTH_SECRET as the running containers see it: the CLI generates it
 * into e2e/.elmo/.env, and the env var wins if a run overrides it.
 */
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

/** Mint a session for an existing user. Returns the signed cookie value. */
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

/**
 * Insert the user if absent and make them an admin with report-generator
 * access, so the sidebar's admin section is populated in every mode.
 */
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

/**
 * The local-mode signup hook creates the "default" org + admin membership on
 * first register (matching TEST_BRAND_ID). The idempotent writes below cover
 * the other modes, DBs populated before the hook existed, and let us tweak
 * TEST_BRAND_NAME without a full reset.
 */
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

/** Remove accounts a spec created, so the spec can be run again. */
export async function deleteUsers(emails: string[]): Promise<void> {
  await withDb(async (client) => {
    // account/session/member rows cascade from the user row.
    await client.query(`DELETE FROM "user" WHERE email = ANY($1::text[])`, [emails]);
  });
}

/**
 * Whether an account exists. Rejected signups surface a generic message, so
 * specs assert on the account not being created rather than on wording.
 */
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
 * Fail loudly if the session the setup just established isn't usable.
 *
 * The role check is not incidental: better-auth caches the session's user
 * fields in a cookie for five minutes, so a session opened before the admin
 * role was granted keeps reporting the old one until that cache expires. It
 * surfaces as the sidebar's admin section and /reports quietly going missing,
 * which is far easier to read here than spread across the specs.
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
