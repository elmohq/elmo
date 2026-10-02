import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UNAVAILABLE_SENTINEL } from "@/lib/fanout-analysis";
import {
	countPromptRuns,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getPromptRuns,
	getResponseMatches,
} from "@/lib/postgres-read";
import { createBrand, createCitation, createPrompt, createRun, deleteBrand } from "@/test/integration/stats-fixtures";

const brandIds: string[] = [];

async function brand(opts?: Parameters<typeof createBrand>[0]) {
	const id = await createBrand(opts);
	brandIds.push(id);
	return id;
}

afterAll(async () => {
	for (const id of brandIds) await deleteBrand(id);
});

describe("prompt runs", () => {
	let brandId: string;
	let promptId: string;

	beforeAll(async () => {
		brandId = await brand();
		promptId = await createPrompt(brandId);
		const run = await createRun(brandId, promptId, {
			at: "2026-03-01T10:00:00Z",
			brandMentioned: true,
			competitors: ["Globex", "Initech"],
		});
		await createRun(brandId, promptId, { at: "2026-03-02T10:00:00Z", brandMentioned: false, competitors: ["Globex"] });
		await createRun(brandId, promptId, { at: "2026-03-02T11:00:00Z", brandMentioned: false });
		await createCitation(run, "https://a.example/1");
		await createCitation(run, "https://a.example/2");
	});

	it("pages a prompt's runs newest first with their citation counts", async () => {
		const window = ["2026-03-01", "2026-03-02", "UTC"] as const;
		expect(await countPromptRuns(promptId, ...window)).toBe(3);
		const firstPage = await getPromptRuns(promptId, ...window, 2, 0);
		const secondPage = await getPromptRuns(promptId, ...window, 2, 2);
		expect(firstPage.map((run) => run.brand_mentioned)).toEqual([false, false]);
		expect(secondPage).toEqual([expect.objectContaining({ brand_mentioned: true, citation_count: 2 })]);
	});

	it("treats instant bounds as half-open", async () => {
		expect(await countPromptRuns(promptId, "2026-03-02T10:00:00.000Z", "2026-03-02T11:00:00.000Z", "UTC")).toBe(1);
		expect(await countPromptRuns(promptId, "2026-03-02T10:00:00.000Z", "2026-03-02T11:00:00.001Z", "UTC")).toBe(2);
	});
});

describe("runs without a provider", () => {
	let brandId: string;
	let promptId: string;

	beforeAll(async () => {
		brandId = await brand();
		promptId = await createPrompt(brandId);
		// Recorded before runs carried a provider; the model alone can't make it the grounded API route.
		await createRun(brandId, promptId, { at: "2026-03-02T10:00:00Z", brandMentioned: true, provider: null });
		await createRun(brandId, promptId, { at: "2026-03-02T11:00:00Z", brandMentioned: false, provider: "openai-api" });
	});

	it("count as the standard model, not the grounded one", async () => {
		const window = ["2026-03-02", "2026-03-02", "UTC"] as const;
		expect(await countPromptRuns(promptId, ...window, "chatgpt")).toBe(1);
		expect(await countPromptRuns(promptId, ...window, "chatgpt::premium")).toBe(1);
		const scope = { brandId, fromDate: "2026-03-02", toDate: "2026-03-02", timezone: "UTC", promptIds: [promptId] };
		const standard = await getResponseMatches({ ...scope, model: "chatgpt" }, 10, 0);
		expect(standard.map((row) => row.provider)).toEqual([null]);
	});
});

describe("query fan-out", () => {
	let brandId: string;
	let promptId: string;

	beforeAll(async () => {
		brandId = await brand();
		promptId = await createPrompt(brandId, { value: "Best CRM for startups" });
		const at = "2026-03-02T10:00:00Z";
		await createRun(brandId, promptId, {
			at,
			brandMentioned: true,
			webQueries: ["CRM pricing", " crm pricing", "best crm for startups", UNAVAILABLE_SENTINEL, ""],
		});
		await createRun(brandId, promptId, {
			at,
			brandMentioned: false,
			webQueries: ["crm pricing", "hubspot alternatives"],
		});
		await createRun(brandId, promptId, { at, brandMentioned: false, webQueries: [UNAVAILABLE_SENTINEL] });
		await createRun(brandId, promptId, { at, brandMentioned: false, webSearch: false });
	});

	it("counts genuine queries once per run, ignoring echoes of the prompt and the unavailable sentinel", async () => {
		const rows = await getFanoutBreakdown(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId]);
		expect(rows.map((row) => [row.query, row.count, row.brand_mentions]).sort()).toEqual([
			["crm pricing", 2, 1],
			["hubspot alternatives", 1, 0],
		]);
	});

	it("totals search runs separately from runs that fanned out", async () => {
		expect(await getFanoutModelTotals(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId])).toEqual([
			{ model: "chatgpt", runs: 3, fanout_runs: 2, total_queries: 3 },
		]);
		expect(await getFanoutPromptTotals(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId])).toEqual([
			{ prompt_id: promptId, runs: 2 },
		]);
	});
});
