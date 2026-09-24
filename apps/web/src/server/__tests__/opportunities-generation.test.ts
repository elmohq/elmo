import { beforeEach, describe, expect, it, vi } from "vitest";

const DAY_MS = 86_400_000;
const BRAND = "brand_1";

const state = vi.hoisted(() => ({
	reports: [] as Array<{ brandId: string; report: unknown; model: string | null; createdAt: Date }>,
	jobs: [] as Array<{ state: string; created_on: Date }>,
	sent: [] as Array<{ name: string; data: unknown; options: unknown }>,
}));

vi.mock("@workspace/lib/db/db", () => {
	const chain: Record<string, unknown> = {};
	for (const method of ["from", "where", "orderBy"]) chain[method] = () => chain;
	chain.limit = async () => [...state.reports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	return {
		db: {
			select: () => chain,
			execute: async () => ({
				rows: [...state.jobs].sort((a, b) => b.created_on.getTime() - a.created_on.getTime()),
			}),
		},
	};
});

vi.mock("@/lib/boss-client", () => ({
	getBoss: async () => ({
		send: async (name: string, data: unknown, options: unknown) => {
			state.sent.push({ name, data, options });
			return "job_1";
		},
	}),
}));

const { resolveOpportunities } = await import("@/server/opportunities");
const { publishedOpportunities } = await import("@/server/opportunities-core");

function storeReport(title: string, ageDays: number) {
	state.reports.push({
		brandId: BRAND,
		report: {
			summary: [],
			risks: [],
			opportunities: [
				{ category: "outreach", title, why: "stored", relatedPrompts: [], yourCitations: [], competitorCitations: [] },
			],
		},
		model: "stored-model",
		createdAt: new Date(Date.now() - ageDays * DAY_MS),
	});
}

function recordJob(jobState: string, ageMinutes: number) {
	state.jobs.push({ state: jobState, created_on: new Date(Date.now() - ageMinutes * 60_000) });
}

const titles = (report: { opportunities: Array<{ title: string }> } | null) =>
	(report?.opportunities ?? []).map((o) => o.title);

beforeEach(() => {
	state.reports.length = 0;
	state.jobs.length = 0;
	state.sent.length = 0;
});

describe("resolveOpportunities", () => {
	it("serves a fresh report without enqueueing generation", async () => {
		storeReport("Stored opportunity", 1);

		const result = await resolveOpportunities(BRAND);

		expect(titles(result.report)).toEqual(["Stored opportunity"]);
		expect(state.sent).toEqual([]);
	});

	it("serves a stale report while enqueueing one generation job keyed by brand", async () => {
		storeReport("Stored opportunity", 30);

		const result = await resolveOpportunities(BRAND, "America/Chicago");

		expect(titles(result.report)).toEqual(["Stored opportunity"]);
		expect(state.sent).toEqual([
			{
				name: "generate-opportunities",
				data: { brandId: BRAND, timezone: "America/Chicago" },
				options: { singletonKey: BRAND },
			},
		]);
	});

	it("says a first report is being generated when nothing is stored", async () => {
		const result = await resolveOpportunities(BRAND);

		expect(result.reason).toBe("generating");
		expect(result.report).toBeNull();
		expect(state.sent).toHaveLength(1);
	});

	it("reports insufficient data from a recent job that found too little to write about", async () => {
		recordJob("completed", 5);

		const result = await resolveOpportunities(BRAND);

		expect(result.reason).toBe("insufficient-data");
		expect(state.sent).toEqual([]);
	});

	it("surfaces a recent failed job instead of paying for another attempt", async () => {
		recordJob("failed", 5);

		await expect(resolveOpportunities(BRAND)).rejects.toThrow("Failed to generate");
		expect(state.sent).toEqual([]);
	});

	it("keeps serving a stale report when the last attempt failed", async () => {
		storeReport("Stored opportunity", 30);
		recordJob("failed", 5);

		const result = await resolveOpportunities(BRAND);

		expect(titles(result.report)).toEqual(["Stored opportunity"]);
		expect(state.sent).toEqual([]);
	});

	it("tries again once the last attempt is old enough", async () => {
		recordJob("completed", 120);

		const result = await resolveOpportunities(BRAND);

		expect(result.reason).toBe("generating");
		expect(state.sent).toHaveLength(1);
	});
});

describe("read-only surfaces", () => {
	it("serves a long-stale report as-is without enqueueing generation", async () => {
		storeReport("Stored opportunity", 90);

		const published = await publishedOpportunities(BRAND);

		expect(published.status).toBe("ready");
		expect(published.opportunities.map((o) => o.title)).toEqual(["Stored opportunity"]);
		expect(state.sent).toEqual([]);
	});

	it("reports a brand with no stored report as not-generated", async () => {
		const published = await publishedOpportunities(BRAND);

		expect(published.status).toBe("not-generated");
		expect(published.opportunities).toEqual([]);
		expect(published.generatedAt).toBeNull();
		expect(state.sent).toEqual([]);
	});
});
