import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ----------------------------------------------------------------

// postgres-read: spy on all six functions used by the analytics tools.
const postgresRead = vi.hoisted(() => ({
	getDashboardSummary: vi.fn(),
	getBrandMentionRateByModel: vi.fn(),
	getPerPromptRunStats: vi.fn(),
	getPromptMentionSummary: vi.fn(),
	getPromptTopCompetitorMentions: vi.fn(),
	getPerPromptCitationPages: vi.fn(),
}));

vi.mock("@/lib/postgres-read", () => postgresRead);

// prompt-resolution: spy on resolveFilteredPrompts.
const promptResolution = vi.hoisted(() => ({
	resolveFilteredPrompts: vi.fn(),
}));

vi.mock("@/server/prompt-resolution", () => promptResolution);

// prompts-core: keep real error classes, replace getPromptById with a spy.
vi.mock("@/server/prompts-core", async (orig) => ({
	...(await orig<typeof import("@/server/prompts-core")>()),
	getPromptById: vi.fn(),
}));

// db: FIFO chain mock — state.results is a queue; each awaited select chain
// pops one entry. Mirrors the pattern in prompts-core.test.ts.
const { mockDb, dbState } = vi.hoisted(() => {
	const dbState = { results: [] as unknown[] };
	const next = () => (dbState.results.length ? dbState.results.shift() : []);

	// biome-ignore lint/suspicious/noExplicitAny: intentional thenable chain mock
	function chain(): any {
		// biome-ignore lint/suspicious/noExplicitAny: intentional thenable chain mock
		const c: any = {
			from: () => c,
			where: () => c,
			orderBy: () => c,
			limit: () => c,
			// biome-ignore lint/suspicious/noThenProperty: deliberate thenable for await
			then: (res: any, rej: any) => Promise.resolve(next()).then(res, rej),
		};
		return c;
	}

	const mockDb = { select: () => chain() };
	return { mockDb, dbState };
});

vi.mock("@workspace/lib/db/db", () => ({ db: mockDb }));

// Pure helpers are NOT mocked — providers, timezone-utils, chart-utils stay real.

import { PromptNotFoundError, getPromptById } from "@/server/prompts-core";
import { KNOWN_MODELS } from "@workspace/lib/providers";
import { analyticsTools } from "@/lib/mcp/tools-analytics";
import { runTool } from "@/lib/mcp/server";

function tool(name: string) {
	const found = analyticsTools.find((t) => t.name === name);
	if (!found) throw new Error(`tool ${name} not in analyticsTools`);
	return found;
}

beforeEach(() => {
	vi.clearAllMocks();
	dbState.results = [];
});

// ─── list_models ────────────────────────────────────────────────────────────

describe("list_models", () => {
	it("without brandId: returns all KNOWN_MODELS ids with labels, no enabled field", async () => {
		const result = await runTool(tool("list_models"), {});

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");
		const allIds = Object.keys(KNOWN_MODELS);

		expect(data.models).toHaveLength(allIds.length);
		for (const m of data.models) {
			expect(allIds).toContain(m.id);
			expect(typeof m.label).toBe("string");
			expect(typeof m.iconId).toBe("string");
			expect(m.enabled).toBeUndefined();
		}
		expect(data.brandEnabledModels).toBeUndefined();
	});

	it("with brandId whose enabledModels is ['chatgpt']: chatgpt enabled:true, others enabled:false", async () => {
		dbState.results = [[{ enabledModels: ["chatgpt"], name: "TestBrand" }]];

		const result = await runTool(tool("list_models"), { brandId: "b1" });

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");
		const chatgpt = data.models.find((m: { id: string }) => m.id === "chatgpt");
		expect(chatgpt).toBeDefined();
		expect(chatgpt.enabled).toBe(true);

		const otherModel = data.models.find((m: { id: string }) => m.id !== "chatgpt");
		expect(otherModel).toBeDefined();
		expect(otherModel.enabled).toBe(false);

		expect(data.brandEnabledModels).toEqual(["chatgpt"]);
	});

	it("with brandId whose enabledModels is null: all models enabled:true", async () => {
		dbState.results = [[{ enabledModels: null, name: "TestBrand" }]];

		const result = await runTool(tool("list_models"), { brandId: "b1" });

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");
		for (const m of data.models) {
			expect(m.enabled).toBe(true);
		}
		expect(data.brandEnabledModels).toBeNull();
	});

	it("with unknown brandId (db returns []): isError true (BrandNotFoundError)", async () => {
		dbState.results = [[]];

		const result = await runTool(tool("list_models"), { brandId: "unknown-brand" });

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? "null");
		expect(body.error).toMatch(/unknown-brand/);
	});
});

// ─── get_performance ─────────────────────────────────────────────────────────

describe("get_performance", () => {
	it("happy path: enriches model rows with label and mentionRate", async () => {
		promptResolution.resolveFilteredPrompts.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
		postgresRead.getDashboardSummary.mockResolvedValue([
			{
				total_prompts: 2,
				total_runs: 50,
				avg_visibility: 40,
				non_branded_visibility: 40,
				last_updated: "2026-06-01T00:00:00.000Z",
			},
		]);
		postgresRead.getBrandMentionRateByModel.mockResolvedValue([
			{ model: "chatgpt", runs: 10, brand_mentioned_count: 4 },
		]);

		const result = await runTool(tool("get_performance"), { brandId: "b1", lookback: "1m" });

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");

		expect(data.brandId).toBe("b1");
		expect(data.lookback).toBe("1m");
		expect(typeof data.range.from).toBe("string");
		expect(typeof data.range.to).toBe("string");

		expect(data.modelBreakdown).toHaveLength(1);
		const row = data.modelBreakdown[0];
		expect(row.model).toBe("chatgpt");
		expect(row.label).toBe("ChatGPT");
		expect(row.runs).toBe(10);
		expect(row.brandMentionedCount).toBe(4);
		expect(row.mentionRate).toBeCloseTo(0.4);

		expect(postgresRead.getDashboardSummary).toHaveBeenCalledWith(
			"b1",
			expect.any(String),
			expect.any(String),
			"UTC",
			["p1", "p2"],
		);
		expect(postgresRead.getBrandMentionRateByModel).toHaveBeenCalledWith(
			"b1",
			expect.any(String),
			expect.any(String),
			"UTC",
			["p1", "p2"],
		);
	});

	it("zero enabled prompts: returns note, summary:null, empty breakdown, does NOT call data helpers", async () => {
		promptResolution.resolveFilteredPrompts.mockResolvedValue([]);

		const result = await runTool(tool("get_performance"), { brandId: "b2" });

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");

		expect(data.summary).toBeNull();
		expect(data.modelBreakdown).toEqual([]);
		expect(typeof data.note).toBe("string");
		expect(data.note.length).toBeGreaterThan(0);

		expect(postgresRead.getDashboardSummary).not.toHaveBeenCalled();
		expect(postgresRead.getBrandMentionRateByModel).not.toHaveBeenCalled();
	});
});

// ─── get_prompt_stats ────────────────────────────────────────────────────────

describe("get_prompt_stats", () => {
	it("happy path: aggregates all four helpers and picks the right runStats row", async () => {
		vi.mocked(getPromptById).mockResolvedValue({
			id: "p1",
			brandId: "b1",
			value: "test prompt",
			enabled: true,
			tags: [],
			systemTags: [],
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		});

		postgresRead.getPromptMentionSummary.mockResolvedValue({
			total_runs: 20,
			brand_mentioned_count: 8,
			competitor_mentioned_count: 3,
		});
		postgresRead.getPromptTopCompetitorMentions.mockResolvedValue([
			{ competitor_name: "Rival Co", mention_count: 3 },
		]);
		postgresRead.getPerPromptRunStats.mockResolvedValue([
			{
				prompt_id: "p1",
				runs: 20,
				run_days: 5,
				brand_mention_rate: 0.4,
				competitor_mention_rate: 0.15,
			},
			{
				prompt_id: "other",
				runs: 5,
				run_days: 2,
				brand_mention_rate: 0.2,
				competitor_mention_rate: 0.05,
			},
		]);
		postgresRead.getPerPromptCitationPages.mockResolvedValue([
			{ prompt_id: "p1", url: "https://example.com", domain: "example.com", title: "Example", count: 3 },
		]);

		const result = await runTool(tool("get_prompt_stats"), { promptId: "p1", lookback: "3m" });

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");

		expect(data.promptId).toBe("p1");
		expect(data.brandId).toBe("b1");
		expect(data.lookback).toBe("3m");
		expect(typeof data.range.from).toBe("string");
		expect(typeof data.range.to).toBe("string");

		expect(data.mentionSummary.total_runs).toBe(20);
		expect(data.topCompetitors).toHaveLength(1);
		expect(data.topCompetitors[0].competitor_name).toBe("Rival Co");

		// runStats must be the row for prompt_id === "p1", not "other"
		expect(data.runStats).not.toBeNull();
		expect(data.runStats.prompt_id).toBe("p1");
		expect(data.runStats.runs).toBe(20);

		expect(data.citationPages).toHaveLength(1);
	});

	it("not found: getPromptById throws PromptNotFoundError → isError true", async () => {
		vi.mocked(getPromptById).mockRejectedValue(new PromptNotFoundError("missing-p"));

		const result = await runTool(tool("get_prompt_stats"), { promptId: "missing-p" });

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? "null");
		expect(body.error).toMatch(/missing-p/);
	});
});

// ─── get_opportunities ───────────────────────────────────────────────────────

describe("get_opportunities", () => {
	it("found: returns report, ageDays (number), and note", async () => {
		const createdAt = new Date("2026-01-01T00:00:00Z");
		dbState.results = [
			[{ id: "op1", brandId: "b1", createdAt, model: "gpt-4", report: { items: ["improve x"] } }],
		];

		const result = await runTool(tool("get_opportunities"), { brandId: "b1" });

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");

		expect(data.brandId).toBe("b1");
		expect(data.report).toEqual({ items: ["improve x"] });
		expect(typeof data.ageDays).toBe("number");
		expect(data.ageDays).toBeGreaterThanOrEqual(0);
		expect(typeof data.note).toBe("string");
		expect(data.note).toContain("day(s) ago");
		expect(data.model).toBe("gpt-4");
	});

	it("not found: returns report:null and 'not generated yet' note", async () => {
		dbState.results = [[]];

		const result = await runTool(tool("get_opportunities"), { brandId: "b2" });

		expect(result.isError).toBeUndefined();
		const data = JSON.parse(result.content[0]?.text ?? "null");

		expect(data.brandId).toBe("b2");
		expect(data.report).toBeNull();
		expect(data.note).toMatch(/No opportunities report/);
	});
});

// ─── readOnlySafe flags ───────────────────────────────────────────────────────

describe("analyticsTools readOnlySafe flags", () => {
	it("all four analytics tools are readOnlySafe: true", () => {
		for (const t of analyticsTools) {
			expect(t.readOnlySafe).toBe(true);
		}
	});
});
