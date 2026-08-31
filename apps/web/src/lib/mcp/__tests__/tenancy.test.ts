/**
 * No tool reaches a brand without asking whose it is.
 *
 * Scope filtering decides which tools a connection is *offered*; this is the
 * other half — that a tool it is offered still can't read across tenants. Every
 * such check goes through `lib/api/scope`, the same module `/api/v1` uses, so
 * the invariant is checkable: stub that module to refuse everything and no tool
 * should get anywhere.
 *
 * A tool that queried the database directly would sail past a stubbed scope
 * module and return the stub's rows, which is what this fails on. The two
 * exemptions are listed by name, so exempting a third is a deliberate act.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REFUSED = new Error("scope check reached");

/**
 * Every tenancy helper, stubbed to refuse. `brandScopeCondition` is included
 * because the list tools use it instead of loading a brand — for them, it *is*
 * the check.
 */
vi.mock("@/lib/api/scope", () => ({
	requireBrandInScope: vi.fn(() => {
		throw REFUSED;
	}),
	isBrandInScope: vi.fn(() => {
		throw REFUSED;
	}),
	brandScopeCondition: vi.fn(() => {
		throw REFUSED;
	}),
	organizationScopeCondition: vi.fn(() => {
		throw REFUSED;
	}),
}));

/**
 * Anything a tool might reach for before the scope check answers, so a tool
 * that skipped the check gets plausible rows rather than a connection error —
 * and this test fails for the right reason.
 */
vi.mock("@workspace/lib/db/db", () => {
	const row = { id: "row_1", brandId: "brand_1", organizationId: "org_1", report: {}, createdAt: new Date() };
	const chain: Record<string | symbol, unknown> = new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === "then") return (resolve: (rows: unknown[]) => unknown) => resolve([row]);
				return () => chain;
			},
		},
	);
	return { db: chain };
});

vi.mock("@/lib/postgres-read", () => ({
	getPromptRuns: async () => [],
	countPromptRuns: async () => 0,
}));

const { MCP_TOOLS } = await import("../tools");

/**
 * The smallest call that gets each tool past argument validation. Hand-written
 * so a new tool has to be added here, which is the point: the alternative
 * fabricates arguments and silently skips whatever it fabricates wrong.
 */
const CALLS: Record<string, Record<string, unknown>> = {
	list_brands: {},
	get_brand: { brandId: "brand_1" },
	list_competitors: { brandId: "brand_1" },
	list_prompts: { brandId: "brand_1" },
	list_prompt_tags: { brandId: "brand_1" },
	create_prompts: { brandId: "brand_1", prompts: [{ value: "who makes the best widgets?" }] },
	update_prompt: { promptId: "prompt_1", enabled: false },
	delete_prompt: { promptId: "prompt_1" },
	get_visibility: { brandId: "brand_1", lookback: "1m" },
	get_share_of_voice: { brandId: "brand_1", lookback: "1m" },
	get_platform_breakdown: { brandId: "brand_1", lookback: "1m" },
	get_prompt_performance: { brandId: "brand_1", lookback: "1m" },
	get_citations: { brandId: "brand_1", lookback: "1m" },
	get_query_fanout: { brandId: "brand_1", lookback: "1m" },
	get_opportunities: { brandId: "brand_1" },
	list_runs: { promptId: "prompt_1", lookback: "1m" },
	get_run: { runId: "run_1" },
};

/** Tools that read no tenant data at all, and so have nothing to scope. */
const NO_TENANT_DATA = ["whoami", "list_platforms"];

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("tenancy", () => {
	it("has a call listed for every tool", () => {
		const covered = [...Object.keys(CALLS), ...NO_TENANT_DATA].sort();
		expect(MCP_TOOLS.map((tool) => tool.name).sort()).toEqual(covered);
	});

	for (const tool of MCP_TOOLS.filter((t) => !NO_TENANT_DATA.includes(t.name))) {
		it(`${tool.name} refuses when the scope check refuses`, async () => {
			const admin = { auth: { kind: "admin", scopes: null, organizationId: null } } as const;
			await expect(tool.run(admin, CALLS[tool.name] as never)).rejects.toBe(REFUSED);
		});
	}
});
