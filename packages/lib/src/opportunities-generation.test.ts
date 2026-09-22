import { beforeEach, describe, expect, it, vi } from "vitest";

const DAY_MS = 86_400_000;
const BRAND = "brand_1";

const state = vi.hoisted(() => ({
	reports: [] as Array<{ brandId: string; report: unknown; model: string | null; createdAt: Date }>,
	runs: 12,
	llmCalls: 0,
	llmFails: false,
}));

vi.mock("./db/db", async () => {
	const { brandOpportunities, brands } = await import("./db/schema");

	function rowsFor(table: unknown) {
		if (table === brandOpportunities) {
			return [...state.reports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		}
		if (table === brands) return [{ name: "Acme", website: "https://acme.test", additionalDomains: [] }];
		return [];
	}

	function select() {
		let table: unknown;
		const chain: Record<string | symbol, unknown> = new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === "then") {
						return (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rowsFor(table)).then(resolve);
					}
					return (value: unknown) => {
						if (prop === "from") table = value;
						return chain;
					};
				},
			},
		);
		return chain;
	}

	return {
		db: {
			select,
			insert: () => ({
				values: async (row: { brandId: string; report: unknown; model: string | null }) => {
					state.reports.push({ ...row, createdAt: new Date() });
				},
			}),
		},
	};
});

vi.mock("./onboarding", () => ({
	runStructuredCompletionPrompt: async () => {
		state.llmCalls += 1;
		if (state.llmFails) throw new Error("provider refused");
		return {
			object: {
				summary: ["Competitors own the roundups"],
				opportunities: [
					{
						category: "outreach",
						title: "Get into the CRM roundups",
						why: "Rivals are cited there and you are not.",
						relatedPrompts: ["best crm for startups"],
					},
				],
				risks: ["Roundup editors move slowly"],
			},
			modelVersion: "test-model",
		};
	},
}));

vi.mock("./prompt-resolution", () => ({
	resolveFilteredPrompts: async () => [{ id: "prompt_1", value: "best crm for startups", systemTags: [], tags: [] }],
}));

vi.mock("./postgres-read", () => ({
	getPerPromptRunStats: async () =>
		state.runs > 0 ? [{ prompt_id: "prompt_1", runs: state.runs, brand_mention_rate: 0.25 }] : [],
	getPerPromptDailyCompetitorMentions: async () => [],
	getPerPromptDailyCitationStats: async () => [],
	getPerPromptCitationPages: async () => [],
	getBrandMentionRateByModel: async () => [],
}));

const { generateOpportunities } = await import("./opportunities");

function storeReport(ageDays: number) {
	state.reports.push({
		brandId: BRAND,
		report: { summary: [], risks: [], opportunities: [] },
		model: "stored-model",
		createdAt: new Date(Date.now() - ageDays * DAY_MS),
	});
}

beforeEach(() => {
	state.reports.length = 0;
	state.runs = 12;
	state.llmCalls = 0;
	state.llmFails = false;
});

describe("generateOpportunities", () => {
	it("writes a new report when the stored one is stale", async () => {
		storeReport(30);

		await expect(generateOpportunities(BRAND, "UTC")).resolves.toBe("generated");

		expect(state.llmCalls).toBe(1);
		expect(state.reports).toHaveLength(2);
		const newest = state.reports.at(-1)?.report as { opportunities: Array<{ title: string }> };
		expect(newest.opportunities.map((o) => o.title)).toEqual(["Get into the CRM roundups"]);
	});

	it("skips the LLM call when a fresh report landed after the job was queued", async () => {
		storeReport(0);

		await expect(generateOpportunities(BRAND, "UTC")).resolves.toBe("already-fresh");

		expect(state.llmCalls).toBe(0);
		expect(state.reports).toHaveLength(1);
	});

	it("reports insufficient data without calling the LLM when nothing has run", async () => {
		state.runs = 0;

		await expect(generateOpportunities(BRAND, "UTC")).resolves.toBe("insufficient-data");

		expect(state.llmCalls).toBe(0);
		expect(state.reports).toHaveLength(0);
	});

	it("fails without writing anything when the LLM never returns a valid report", async () => {
		state.llmFails = true;

		await expect(generateOpportunities(BRAND, "UTC")).rejects.toThrow("Failed to generate");

		expect(state.reports).toHaveLength(0);
	});
});
