import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { updatePrompt } from "@/server/prompts-core";
import { createBrand, createPrompt, deleteBrand } from "@/test/integration/stats-fixtures";

vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: vi.fn(),
	removePromptJobScheduler: vi.fn(),
}));

const current = { extraction: "3", mentions: "1:abc:judge-test" };
let brandId: string;
let promptId: string;

beforeAll(async () => {
	// Saving a prompt checks entitlements, which depend on the deployment mode.
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	brandId = await createBrand();
	promptId = await createPrompt(brandId);
	await db.update(brands).set({ analysisVersions: current }).where(eq(brands.id, brandId));
	await db.update(prompts).set({ enabled: false }).where(eq(prompts.id, promptId));
});

afterAll(async () => {
	vi.unstubAllEnvs();
	await deleteBrand(brandId);
});

const stamps = async () => (await db.select().from(brands).where(eq(brands.id, brandId)))[0].analysisVersions;
const brand = async () => (await db.select().from(brands).where(eq(brands.id, brandId)))[0];

describe("enabling a prompt again", () => {
	it("leaves the brand's history as it is while the prompt stays disabled", async () => {
		await updatePrompt(await brand(), promptId, { tags: ["paused"] });
		expect(await stamps()).toEqual(current);
	});

	it("asks the worker to bring its brand's history up to date", async () => {
		await updatePrompt(await brand(), promptId, { enabled: true });
		const after = await stamps();
		expect(after?.mentions).not.toBe(current.mentions);
		expect(after?.extraction).not.toBe(current.extraction);
	});
});
