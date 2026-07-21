import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntitlementLimitError } from "./config-enforcement";
import { assertCanAddPromptsToOrg, assertEnableTransitionWithinPool } from "./prompt-limits";

const UNLIMITED = Number.MAX_SAFE_INTEGER;

const state = vi.hoisted(() => ({
	entitlements: { maxPromptsPerOrg: null as number | null, claudePromptPool: Number.MAX_SAFE_INTEGER },
	entitlementCalls: 0,
	selectResults: [] as unknown[][],
	selectCalls: 0,
	poolUsage: 0,
	poolCalls: 0,
}));

vi.mock("@workspace/lib/config/entitlements", () => ({
	getEntitlements: async () => {
		state.entitlementCalls++;
		return state.entitlements;
	},
}));

vi.mock("@workspace/lib/config/resolve", () => ({
	countAssignableModelUsage: async () => {
		state.poolCalls++;
		return state.poolUsage;
	},
}));

vi.mock("@workspace/lib/db/db", () => {
	const chain = () => {
		const c: Record<string, unknown> = {};
		for (const method of ["from", "innerJoin", "where", "limit", "orderBy"]) {
			c[method] = () => c;
		}
		c.then = (resolve: (rows: unknown[]) => void, reject: (e: unknown) => void) =>
			Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject);
		return c;
	};
	return {
		db: {
			select: () => {
				state.selectCalls++;
				return chain();
			},
		},
	};
});

beforeEach(() => {
	state.entitlements = { maxPromptsPerOrg: null, claudePromptPool: UNLIMITED };
	state.entitlementCalls = 0;
	state.selectResults = [];
	state.selectCalls = 0;
	state.poolUsage = 0;
	state.poolCalls = 0;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("assertCanAddPromptsToOrg", () => {
	it("no-ops when nothing is being added", async () => {
		await expect(assertCanAddPromptsToOrg("org-1", 0)).resolves.toBeUndefined();
		expect(state.entitlementCalls).toBe(0);
		expect(state.selectCalls).toBe(0);
	});

	it("passes without counting when the org pool is unlimited (non-cloud)", async () => {
		await expect(assertCanAddPromptsToOrg("org-1", 25)).resolves.toBeUndefined();
		expect(state.selectCalls).toBe(0);
	});

	it("blocks a cloud org at its prompt limit", async () => {
		state.entitlements = { maxPromptsPerOrg: 50, claudePromptPool: UNLIMITED };
		state.selectResults = [[{ count: 50 }]];
		await expect(assertCanAddPromptsToOrg("org-1", 1)).rejects.toThrow(EntitlementLimitError);
	});

	it("allows a cloud org under its prompt limit", async () => {
		state.entitlements = { maxPromptsPerOrg: 50, claudePromptPool: UNLIMITED };
		state.selectResults = [[{ count: 49 }]];
		await expect(assertCanAddPromptsToOrg("org-1", 1)).resolves.toBeUndefined();
	});
});

describe("assertEnableTransitionWithinPool", () => {
	it("no-ops for an empty flip set", async () => {
		state.entitlements = { maxPromptsPerOrg: null, claudePromptPool: 1 };
		await expect(assertEnableTransitionWithinPool("org-1", [])).resolves.toBeUndefined();
		expect(state.selectCalls).toBe(0);
	});

	it("passes without queries when the pool is unlimited (non-cloud)", async () => {
		await expect(assertEnableTransitionWithinPool("org-1", ["p-1"])).resolves.toBeUndefined();
		expect(state.selectCalls).toBe(0);
	});

	it("passes when the flipped prompts have no Claude assignments", async () => {
		state.entitlements = { maxPromptsPerOrg: null, claudePromptPool: 1 };
		state.selectResults = [[]];
		await expect(assertEnableTransitionWithinPool("org-1", ["p-1"])).resolves.toBeUndefined();
		expect(state.poolCalls).toBe(0);
	});

	it("blocks the enable when assignments would overflow the pool", async () => {
		state.entitlements = { maxPromptsPerOrg: null, claudePromptPool: 2 };
		state.selectResults = [[{ promptId: "p-1" }]];
		state.poolUsage = 2;
		await expect(assertEnableTransitionWithinPool("org-1", ["p-1"])).rejects.toThrow(/Claude pool/);
	});

	it("allows the enable within pool headroom", async () => {
		state.entitlements = { maxPromptsPerOrg: null, claudePromptPool: 2 };
		state.selectResults = [[{ promptId: "p-1" }]];
		state.poolUsage = 1;
		await expect(assertEnableTransitionWithinPool("org-1", ["p-1"])).resolves.toBeUndefined();
	});
});
