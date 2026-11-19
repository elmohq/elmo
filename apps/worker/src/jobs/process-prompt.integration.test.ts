import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization, promptRuns, prompts, usageEvents } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Job } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../boss", () => ({ getBoss: () => ({ send: vi.fn(async () => "job") }) }));
vi.mock("../telemetry", () => ({ trackWorkerEvent: vi.fn() }));

import { type ProcessPromptData, processPromptJob } from "./process-prompt";

let brandId: string;

const TARGETS = "chatgpt:stub:online";

beforeEach(async () => {
	vi.stubEnv("SCRAPE_TARGETS", TARGETS);
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	brandId = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
});

afterEach(async () => {
	await db.delete(usageEvents).where(eq(usageEvents.brandId, brandId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
	vi.unstubAllEnvs();
});

async function createBrand(market: { country: string; language: string }) {
	await db.insert(brands).values({
		id: brandId,
		organizationId: brandId,
		name: "Acme",
		website: "https://acme.example",
		onboarded: true,
		...market,
	});
}

async function runPrompt(prompt: { value: string; country?: string; language?: string }) {
	const [{ id }] = await db
		.insert(prompts)
		.values({ brandId, ...prompt })
		.returning({ id: prompts.id });
	await processPromptJob([{ data: { promptId: id } } as Job<ProcessPromptData>]);
	// Distinct, since a target is asked several times a cycle.
	return db
		.selectDistinct({ model: promptRuns.model, country: promptRuns.country, language: promptRuns.language })
		.from(promptRuns)
		.where(eq(promptRuns.promptId, id));
}

describe("processPromptJob markets", () => {
	it("asks a prompt from its brand's market and records what the provider was sent", async () => {
		await createBrand({ country: "DE", language: "de" });

		const runs = await runPrompt({ value: "bestes CRM" });

		expect(runs).toEqual([{ model: "chatgpt", country: "DE", language: "de" }]);
	});

	it("asks a prompt with its own market from there, whatever the brand's is", async () => {
		await createBrand({ country: "DE", language: "de" });

		const runs = await runPrompt({ value: "meilleur CRM", country: "FR", language: "fr" });

		expect(runs).toEqual([{ model: "chatgpt", country: "FR", language: "fr" }]);
	});
});
