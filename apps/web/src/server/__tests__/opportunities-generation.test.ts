/**
 * Generating a report is a paid LLM call, so the things that bound the spend —
 * the freshness gate, the per-brand lock, and read surfaces that only read —
 * are behavior worth pinning down.
 *
 * The fake `db` models the two bits of Postgres this leans on: an append-only
 * report table, and advisory locks that a second holder cannot take.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const DAY_MS = 86_400_000;
const BRAND = "brand_1";

const state = vi.hoisted(() => ({
	reports: [] as Array<{ brandId: string; report: unknown; model: string | null; createdAt: Date }>,
	locks: new Set<string>(),
	/** Simulates a concurrent writer committing between a read and the lock. */
	afterReportRead: null as null | (() => void),
}));

const llm = vi.hoisted(() => {
	let entered!: () => void;
	let release!: () => void;
	return {
		calls: 0,
		fails: false,
		entered: new Promise<void>((resolve) => {
			entered = resolve;
		}),
		release: new Promise<void>((resolve) => {
			release = resolve;
		}),
		signalEntered: () => entered(),
		finish: () => release(),
		reset() {
			this.calls = 0;
			this.fails = false;
			this.entered = new Promise<void>((resolve) => {
				entered = resolve;
			});
			this.release = new Promise<void>((resolve) => {
				release = resolve;
			});
		},
	};
});

vi.mock("@workspace/lib/db/db", async () => {
	const { brandOpportunities, brands } = await import("@workspace/lib/db/schema");

	// One brand per test, so the `where` clauses have nothing to narrow.
	function rowsFor(table: unknown) {
		if (table === brandOpportunities) {
			const rows = [...state.reports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			const hook = state.afterReportRead;
			state.afterReportRead = null;
			hook?.();
			return rows;
		}
		if (table === brands) return [{ name: "Acme", website: "https://acme.test", additionalDomains: [] }];
		return [];
	}

	/** Every builder method chains; awaiting the chain runs the "query". */
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

	const client = {
		query: async (text: string, params: unknown[]) => {
			const key = String(params[1]);
			if (text.includes("pg_try_advisory_lock")) {
				if (state.locks.has(key)) return { rows: [{ locked: false }] };
				state.locks.add(key);
				return { rows: [{ locked: true }] };
			}
			if (text.includes("pg_advisory_unlock")) state.locks.delete(key);
			return { rows: [] };
		},
		release: () => {},
	};

	return {
		db: {
			select,
			insert: () => ({
				values: (row: { brandId: string; report: unknown; model: string | null }) => ({
					returning: async () => {
						const saved = { ...row, createdAt: new Date() };
						state.reports.push(saved);
						return [{ createdAt: saved.createdAt }];
					},
				}),
			}),
			$client: { connect: async () => client },
		},
	};
});

vi.mock("@workspace/lib/onboarding", () => ({
	runStructuredCompletionPrompt: async () => {
		llm.calls += 1;
		llm.signalEntered();
		if (llm.fails) throw new Error("provider refused");
		await llm.release;
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

vi.mock("@/server/prompt-resolution", () => ({
	resolveFilteredPrompts: async () => [{ id: "prompt_1", value: "best crm for startups", systemTags: [], tags: [] }],
}));

vi.mock("@/lib/postgres-read", () => ({
	getPerPromptRunStats: async () => [{ prompt_id: "prompt_1", runs: 12, brand_mention_rate: 0.25 }],
	getPerPromptDailyCompetitorMentions: async () => [],
	getPerPromptDailyCitationStats: async () => [],
	getPerPromptCitationPages: async () => [],
	getBrandMentionRateByModel: async () => [],
}));

const { resolveOpportunities, storedOpportunities } = await import("@/server/opportunities");
const { publishedOpportunities } = await import("@/server/opportunities-core");

function storeReport(title: string, ageDays: number) {
	state.reports.push({
		brandId: BRAND,
		report: {
			summary: [],
			risks: [],
			opportunities: [
				{
					category: "outreach",
					title,
					why: "stored",
					relatedPrompts: [],
					yourCitations: [],
					competitorCitations: [],
				},
			],
		},
		model: "stored-model",
		createdAt: new Date(Date.now() - ageDays * DAY_MS),
	});
}

const titles = (report: { opportunities: Array<{ title: string }> } | null) =>
	(report?.opportunities ?? []).map((o) => o.title);

beforeEach(() => {
	state.reports.length = 0;
	state.locks.clear();
	state.afterReportRead = null;
	llm.reset();
});

describe("resolveOpportunities", () => {
	it("serves a report that is still within the refresh window without generating one", async () => {
		storeReport("Stored opportunity", 1);
		llm.finish();

		const result = await resolveOpportunities(BRAND);

		expect(titles(result.report)).toEqual(["Stored opportunity"]);
		expect(llm.calls).toBe(0);
	});

	it("generates once when two callers find the same stale report", async () => {
		storeReport("Stored opportunity", 30);

		const first = resolveOpportunities(BRAND);
		await llm.entered;
		const second = await resolveOpportunities(BRAND);
		llm.finish();

		expect(titles((await first).report)).toEqual(["Get into the CRM roundups"]);
		// The second caller is served the stale report rather than paying again.
		expect(titles(second.report)).toEqual(["Stored opportunity"]);
		expect(llm.calls).toBe(1);
		expect(state.reports).toHaveLength(2);
	});

	it("tells a caller with nothing stored that a report is on its way", async () => {
		const first = resolveOpportunities(BRAND);
		await llm.entered;
		const second = await resolveOpportunities(BRAND);
		llm.finish();
		await first;

		expect(second.reason).toBe("generating");
		expect(second.report).toBeNull();
		expect(llm.calls).toBe(1);
	});

	it("serves the report a concurrent caller wrote while it waited for the lock", async () => {
		state.afterReportRead = () => storeReport("Just written", 0);
		llm.finish();

		const result = await resolveOpportunities(BRAND);

		expect(titles(result.report)).toEqual(["Just written"]);
		expect(llm.calls).toBe(0);
	});

	it("releases the lock when generation fails, so the next caller can try", async () => {
		llm.fails = true;

		await expect(resolveOpportunities(BRAND)).rejects.toThrow("Failed to generate");
		expect(state.locks.size).toBe(0);

		llm.reset();
		llm.finish();
		const retry = await resolveOpportunities(BRAND);

		expect(titles(retry.report)).toEqual(["Get into the CRM roundups"]);
	});
});

describe("read-only surfaces", () => {
	it("serves a long-stale report as-is rather than generating a replacement", async () => {
		storeReport("Stored opportunity", 90);
		llm.finish();

		const published = await publishedOpportunities(BRAND);

		expect(published.status).toBe("ready");
		expect(published.opportunities.map((o) => o.title)).toEqual(["Stored opportunity"]);
		expect(llm.calls).toBe(0);
	});

	it("reports a brand with no stored report as not-generated", async () => {
		llm.finish();

		const published = await publishedOpportunities(BRAND);

		expect(published.status).toBe("not-generated");
		expect(published.opportunities).toEqual([]);
		expect(published.generatedAt).toBeNull();
		expect(llm.calls).toBe(0);
	});

	it("never takes the generation lock", async () => {
		storeReport("Stored opportunity", 90);
		llm.finish();

		await storedOpportunities(BRAND);

		expect(state.locks.size).toBe(0);
	});
});
