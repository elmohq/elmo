/**
 * Playwright global setup for authentication.
 *
 * Registers (or signs in) the E2E test user via better-auth's API,
 * then ensures org + membership rows exist, mints a real better-auth
 * API key for the (now admin) user, and saves session cookies so all
 * tests run as an authenticated admin user.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import pg from "pg";
import { TEST_USER, TEST_BRAND_ID, TEST_BRAND_NAME } from "./seed";

const AUTH_STATE_PATH = "e2e/.auth/user.json";
const API_KEY_PATH = "e2e/.auth/api-key.json";
const DATABASE_URL = "postgres://postgres:postgres@localhost:5432/elmo";

export default async function globalSetup(config: FullConfig) {
	const baseURL = config.projects[0]?.use?.baseURL || "http://localhost:1515";

	const browser = await chromium.launch();
	const page = await browser.newPage({ baseURL });

	try {
		const signUpResponse = await page.request.post("/api/auth/sign-up/email", {
			data: {
				email: TEST_USER.email,
				password: TEST_USER.password,
				name: TEST_USER.name,
			},
		});

		if (!signUpResponse.ok()) {
			const signInResponse = await page.request.post("/api/auth/sign-in/email", {
				data: {
					email: TEST_USER.email,
					password: TEST_USER.password,
				},
			});

			if (!signInResponse.ok()) {
				const body = await signInResponse.text();
				throw new Error(`Auth setup failed: ${signInResponse.status()} ${body}`);
			}
		}

		await page.context().storageState({ path: AUTH_STATE_PATH });
		console.log(`[auth-setup] Authenticated as ${TEST_USER.email}`);

		const client = new pg.Client({ connectionString: DATABASE_URL });
		await client.connect();
		try {
			const userResult = await client.query(
				`SELECT id FROM "user" WHERE email = $1 LIMIT 1`,
				[TEST_USER.email],
			);
			if (userResult.rows.length === 0) {
				throw new Error(`[auth-setup] User ${TEST_USER.email} not found in DB after sign-up`);
			}

			const userId = userResult.rows[0].id;

			// The local-mode signup hook creates the "default" org + admin
			// membership on first register (matches TEST_BRAND_ID). On the
			// sign-in path those rows already exist; the idempotent writes
			// below cover DBs populated before the hook existed and let us
			// tweak TEST_BRAND_NAME without a full reset.
			await client.query(
				`INSERT INTO organization (id, name, slug, created_at)
				 VALUES ($1, $2, $3, NOW())
				 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
				[TEST_BRAND_ID, TEST_BRAND_NAME, TEST_BRAND_ID],
			);

			const existingMember = await client.query(
				`SELECT id FROM member WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
				[TEST_BRAND_ID, userId],
			);
			if (existingMember.rows.length === 0) {
				await client.query(
					`INSERT INTO member (id, organization_id, user_id, role, created_at)
					 VALUES (gen_random_uuid(), $1, $2, 'admin', NOW())`,
					[TEST_BRAND_ID, userId],
				);
			}

			await client.query(
				`UPDATE "user" SET role = 'admin', has_report_generator_access = true WHERE id = $1`,
				[userId],
			);

			console.log(`[auth-setup] Ensured org + membership for user ${userId} in ${TEST_BRAND_ID}`);
		} finally {
			await client.end();
		}

		// Mint a real better-auth API key via the session-authenticated
		// endpoint (the user was just promoted to a global admin above, so
		// this is an admin key with full /api/v1 access). Keys accumulate
		// across runs against a persistent DB, which is harmless — the
		// create endpoint has no uniqueness check on `name`.
		const apiKeyResponse = await page.request.post("/api/auth/api-key/create", {
			data: { name: "e2e-api-key" },
		});

		if (!apiKeyResponse.ok()) {
			const body = await apiKeyResponse.text();
			throw new Error(
				`[auth-setup] API key creation failed: ${apiKeyResponse.status()} ${body}`,
			);
		}

		const apiKeyBody = await apiKeyResponse.json();
		if (!apiKeyBody.key) {
			throw new Error(
				`[auth-setup] API key creation response missing "key": ${apiKeyResponse.status()} ${JSON.stringify(apiKeyBody)}`,
			);
		}

		mkdirSync("e2e/.auth", { recursive: true });
		writeFileSync(API_KEY_PATH, JSON.stringify({ key: apiKeyBody.key }));
		console.log(`[auth-setup] Wrote API key to ${API_KEY_PATH}`);
	} finally {
		await browser.close();
	}
}
