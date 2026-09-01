/**
 * Stub `lib/api/scope` to refuse everything and no tool should get anywhere. A
 * tool querying the database directly sails past it and returns rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REFUSED = new Error("scope check reached");

vi.mock("@/lib/api/scope", () => ({
	requireBrandInScope: vi.fn(async () => {
		throw REFUSED;
	}),
	isBrandInScope: vi.fn(async () => {
		throw REFUSED;
	}),
	brandScopeCondition: vi.fn(async () => {
		throw REFUSED;
	}),
	organizationScopeCondition: vi.fn(() => {
		throw REFUSED;
	}),
	requireOrganizationInScope: vi.fn(() => {
		throw REFUSED;
	}),
}));

/** So a tool that skipped the check gets rows rather than a connection error. */
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
const scope = await import("@/lib/api/scope");

const SCOPE_CHECKS = [
	scope.requireBrandInScope,
	scope.isBrandInScope,
	scope.brandScopeCondition,
	scope.organizationScopeCondition,
	scope.requireOrganizationInScope,
] as unknown as Array<{ mock: { calls: unknown[] } }>;

/** Hand-written so a new tool has to be added here; fabricating arguments
 * silently skips whatever it fabricates wrong. */
const WINDOW = { start: "2026-01-01T00:00:00Z", end: "2026-02-01T00:00:00Z" };

const CALLS: Record<string, Record<string, unknown>> = {
	list_brands: {},
	get_brand: { brandId: "brand_1" },
	list_competitors: { brandId: "brand_1" },
	get_billing: { organizationId: "org_1" },
	list_prompts: { brandId: "brand_1" },
	list_prompt_tags: { brandId: "brand_1" },
	create_prompts: { brandId: "brand_1", prompts: [{ value: "who makes the best widgets?" }] },
	update_prompt: { promptId: "prompt_1", enabled: false },
	get_analytics: { brandId: "brand_1", ...WINDOW },
	get_prompt_performance: { brandId: "brand_1", ...WINDOW },
	get_citations: { brandId: "brand_1", ...WINDOW },
	get_query_fanout: { brandId: "brand_1", ...WINDOW },
	get_opportunities: { brandId: "brand_1" },
	list_runs: { promptId: "prompt_1", ...WINDOW },
	get_run: { promptId: "prompt_1", runId: "run_1" },
};

const NO_TENANT_DATA = ["whoami", "list_models"];

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	for (const check of SCOPE_CHECKS) (check as unknown as { mockClear(): void }).mockClear();
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
			const admin = {
				auth: { kind: "admin", scopes: null, organizationId: null },
				toolNames: [],
			} as const;
			await expect(tool.run(admin, CALLS[tool.name])).rejects.toThrow();
			// Refused *because it asked*, not for some other reason.
			const asked = SCOPE_CHECKS.some((check) => check.mock.calls.length > 0);
			expect(asked, `${tool.name} never consulted lib/api/scope`).toBe(true);
		});
	}
});
