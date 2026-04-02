/**
 * Capture a screenshot of the real Prompt Details page (requires running web app + DB).
 * See AGENTS.md: load env, Postgres, seed data, `pnpm -C apps/web dev`.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { TEST_USER, TEST_BRAND_ID, TEST_BRAND_NAME } from "../seed";

const BRAND_ID = "default";
const PROMPT_ID = "00000000-0000-0000-0000-000000000001";
/** Must match apps/web `.env` DATABASE_URL so org/membership rows match better-auth */
const DATABASE_URL =
	process.env.E2E_DATABASE_URL || "postgres://elmo:elmo@localhost:5432/elmo";

type Args = {
	baseUrl: string;
	outDir: string;
	outFile: string;
};

function parseArgs(): Args {
	const raw = process.argv.slice(2);
	const get = (name: string, fallback?: string) => {
		const idx = raw.indexOf(name);
		if (idx === -1) return fallback;
		return raw[idx + 1];
	};

	const baseUrl = get("--baseUrl", "http://localhost:3000")!;
	const outDir = get("--outDir", path.resolve(process.cwd(), "artifacts/screenshots"))!;
	const outFile = get("--outFile", "issue-101-prompt-details.png")!;
	return { baseUrl, outDir, outFile };
}

async function ensureSession(baseURL: string) {
	const browser = await chromium.launch();
	const context = await browser.newContext({ baseURL });
	const page = await context.newPage();

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
			await browser.close();
			throw new Error(`Auth failed: ${signInResponse.status()} ${body}`);
		}
	}

	const client = new pg.Client({ connectionString: DATABASE_URL });
	await client.connect();
	try {
		const userResult = await client.query(`SELECT id FROM "user" WHERE email = $1 LIMIT 1`, [TEST_USER.email]);
		if (userResult.rows.length === 0) {
			throw new Error(`User ${TEST_USER.email} not found after sign-up`);
		}
		const userId = userResult.rows[0].id;

		await client.query(
			`INSERT INTO organization (id, name, slug, created_at)
			 VALUES ($1, $2, $3, NOW())
			 ON CONFLICT (id) DO NOTHING`,
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

		await client.query(`UPDATE "user" SET role = 'admin', has_report_generator_access = true WHERE id = $1`, [userId]);
	} finally {
		await client.end();
	}

	return { browser, context, page };
}

async function main() {
	const { baseUrl, outDir, outFile } = parseArgs();
	fs.mkdirSync(outDir, { recursive: true });

	const { browser, context, page } = await ensureSession(baseUrl);

	try {
		const url = `/app/${BRAND_ID}/prompts/${PROMPT_ID}`;
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

		await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible", timeout: 60_000 });
		await page.getByText("Edit prompts").waitFor({ state: "visible", timeout: 30_000 });

		const header = page.locator("h1").first();
		await header.scrollIntoViewIfNeeded();

		const outPath = path.join(outDir, outFile);
		await page.screenshot({ path: outPath, fullPage: false });
		console.log(`Saved: ${outPath}`);
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
