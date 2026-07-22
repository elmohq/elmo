import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UNLIMITED = Number.MAX_SAFE_INTEGER;

const state = vi.hoisted(() => ({
	session: { user: { id: "u-1", role: null as string | null } },
	selectResults: [] as unknown[][],
	writes: [] as { type: "upsert" | "delete"; values?: Record<string, unknown> }[],
	transactions: 0,
	denyKeys: new Set<string>(),
	gateCalls: [] as { key: string; scope: string; orgId: string | null }[],
	entitlements: {} as Record<string, unknown>,
	poolUsage: 0,
	clearCalls: 0,
}));

// The module builds its server fns at import time; stub the builder so tests
// exercise the exported impls without a running Start app.
vi.mock("@tanstack/react-start", () => {
	const builder = () => {
		const b: Record<string, unknown> = {};
		b.validator = () => b;
		b.middleware = () => b;
		b.handler = () => () => undefined;
		return b;
	};
	return { createServerFn: builder };
});

vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: async () => state.session,
	isAdmin: (s: { user?: { role?: string | null } }) => s?.user?.role === "admin",
	requireOrgAccess: async () => {},
}));

vi.mock("@/lib/auth/config-gates", () => ({
	requireConfigWrite: async (input: { key: string; scope: string; orgId: string | null }) => {
		state.gateCalls.push(input);
		if (state.denyKeys.has(input.key)) throw new Error("Forbidden: instance-admin-required");
	},
}));

vi.mock("@workspace/lib/config/entitlements", () => ({
	getEntitlements: async () => state.entitlements,
}));

vi.mock("@workspace/lib/config/resolve", () => ({
	clearConfigCache: () => {
		state.clearCalls++;
	},
	countAssignableModelUsage: async () => state.poolUsage,
	fetchConfigRows: async () => [],
	mergeConfigRows: () => ({}),
	resolveBrandTargets: async () => ({}),
	resolveEffectiveTargets: () => ({ targets: [], excluded: [] }),
}));

vi.mock("@workspace/lib/db/db", () => {
	const chain = () => {
		const c: Record<string, unknown> = {};
		for (const method of ["from", "innerJoin", "where", "limit"]) {
			c[method] = () => c;
		}
		c.then = (resolve: (rows: unknown[]) => void, reject: (e: unknown) => void) =>
			Promise.resolve(state.selectResults.shift() ?? []).then(resolve, reject);
		return c;
	};
	const tx = {
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				onConflictDoUpdate: () => {
					state.writes.push({ type: "upsert", values });
					return Promise.resolve();
				},
			}),
		}),
		delete: () => ({
			where: () => {
				state.writes.push({ type: "delete" });
				return Promise.resolve();
			},
		}),
	};
	return {
		db: {
			select: () => chain(),
			transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
				state.transactions++;
				return cb(tx);
			},
		},
	};
});

import { setConfigValuesImpl } from "./config-entries.server";

const unlimitedEntitlements = {
	standardModelMenu: null,
	standardModelPicks: null,
	claudePromptPool: UNLIMITED,
};

const BRAND_ROW = [{ id: "brand-1", organizationId: "org-real" }];
const ENABLED_PROMPT_ROW = [{ id: "p-1", brandId: "brand-1", enabled: true, organizationId: "org-real" }];

beforeEach(() => {
	state.session = { user: { id: "u-1", role: null } };
	state.selectResults = [];
	state.writes = [];
	state.transactions = 0;
	state.denyKeys = new Set();
	state.gateCalls = [];
	state.entitlements = { ...unlimitedEntitlements };
	state.poolUsage = 0;
	state.clearCalls = 0;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("setConfigValuesImpl — scope resolution and gating", () => {
	it("gates with the server-resolved owning org id, never the client id", async () => {
		state.selectResults = [BRAND_ROW];
		await setConfigValuesImpl({
			scope: "brand",
			id: "brand-1",
			entries: [{ key: "run.enabled_models", value: ["chatgpt"] }],
		});
		expect(state.gateCalls).toEqual([{ key: "run.enabled_models", scope: "brand", orgId: "org-real" }]);
	});

	it("rejects an unknown brand before writing", async () => {
		state.selectResults = [[]];
		await expect(
			setConfigValuesImpl({ scope: "brand", id: "nope", entries: [{ key: "run.enabled_models", value: [] }] }),
		).rejects.toThrow("Brand not found");
		expect(state.transactions).toBe(0);
	});

	it("propagates a policy denial and writes nothing", async () => {
		state.selectResults = [BRAND_ROW];
		state.denyKeys.add("run.cadence_hours");
		await expect(
			setConfigValuesImpl({ scope: "brand", id: "brand-1", entries: [{ key: "run.cadence_hours", value: 6 }] }),
		).rejects.toThrow("instance-admin-required");
		expect(state.writes).toHaveLength(0);
		expect(state.transactions).toBe(0);
	});
});

describe("setConfigValuesImpl — registry validation", () => {
	it("rejects an unknown key before any write", async () => {
		state.selectResults = [BRAND_ROW];
		await expect(
			setConfigValuesImpl({ scope: "brand", id: "brand-1", entries: [{ key: "run.nope", value: 1 }] }),
		).rejects.toThrow(/Unknown config key/);
		expect(state.transactions).toBe(0);
	});

	it("rejects a key at a disallowed scope", async () => {
		state.selectResults = [BRAND_ROW];
		await expect(
			setConfigValuesImpl({
				scope: "brand",
				id: "brand-1",
				entries: [{ key: "run.model_mode", selector: { model: "claude" }, value: "web" }],
			}),
		).rejects.toThrow(/not allowed at scope "brand"/);
		expect(state.transactions).toBe(0);
	});
});

describe("setConfigValuesImpl — transactional writes", () => {
	it("writes all entries in one transaction, stamps updatedBy, and clears the cache", async () => {
		state.selectResults = [BRAND_ROW];
		const result = await setConfigValuesImpl({
			scope: "brand",
			id: "brand-1",
			entries: [
				{ key: "run.enabled_models", value: ["chatgpt", "gemini"] },
				{ key: "run.cadence_hours", value: undefined },
			],
		});
		expect(result).toEqual({ written: 1, deleted: 1 });
		expect(state.transactions).toBe(1);
		expect(state.writes).toEqual([
			{
				type: "upsert",
				values: expect.objectContaining({
					scope: "brand",
					brandId: "brand-1",
					organizationId: null,
					promptId: null,
					key: "run.enabled_models",
					value: ["chatgpt", "gemini"],
					updatedBy: "u-1",
				}),
			},
			{ type: "delete" },
		]);
		expect(state.clearCalls).toBe(1);
	});

	it("treats a null value as delete (revert to inherit)", async () => {
		state.selectResults = [BRAND_ROW];
		const result = await setConfigValuesImpl({
			scope: "brand",
			id: "brand-1",
			entries: [{ key: "run.enabled_models", value: null }],
		});
		expect(result).toEqual({ written: 0, deleted: 1 });
		expect(state.writes).toEqual([{ type: "delete" }]);
	});
});

describe("setConfigValuesImpl — entitlement clamps", () => {
	const cloudEntitlements = {
		standardModelMenu: ["chatgpt", "gemini"],
		standardModelPicks: 2,
		claudePromptPool: 1,
	};

	it("blocks off-menu brand picks in cloud", async () => {
		state.selectResults = [BRAND_ROW];
		state.entitlements = { ...cloudEntitlements };
		await expect(
			setConfigValuesImpl({
				scope: "brand",
				id: "brand-1",
				entries: [{ key: "run.enabled_models", value: ["chatgpt", "claude"] }],
			}),
		).rejects.toThrow(/not available on your plan/);
		expect(state.transactions).toBe(0);
	});

	it("blocks more picks than the plan allows", async () => {
		state.selectResults = [BRAND_ROW];
		state.entitlements = { ...cloudEntitlements, standardModelPicks: 1 };
		await expect(
			setConfigValuesImpl({
				scope: "brand",
				id: "brand-1",
				entries: [{ key: "run.enabled_models", value: ["chatgpt", "gemini"] }],
			}),
		).rejects.toThrow(/up to 1 tracked model/);
	});

	it("passes any picks under unlimited (non-cloud) entitlements", async () => {
		state.selectResults = [BRAND_ROW];
		const result = await setConfigValuesImpl({
			scope: "brand",
			id: "brand-1",
			entries: [{ key: "run.enabled_models", value: ["whatever", "else"] }],
		});
		expect(result.written).toBe(1);
	});

	it("blocks a NEW Claude assignment on an enabled prompt when the pool is full", async () => {
		// select #1: prompt+brand join; select #2: existing assignment rows (none).
		state.selectResults = [ENABLED_PROMPT_ROW, []];
		state.entitlements = { ...cloudEntitlements };
		state.poolUsage = 1;
		await expect(
			setConfigValuesImpl({
				scope: "prompt",
				id: "p-1",
				entries: [{ key: "run.model_mode", selector: { model: "claude" }, value: "web" }],
			}),
		).rejects.toThrow(/Claude pool/);
		expect(state.transactions).toBe(0);
	});

	it("allows switching mode on an EXISTING assignment even at a full pool", async () => {
		state.selectResults = [ENABLED_PROMPT_ROW, [{ key: "run.model_mode", value: "base" }]];
		state.entitlements = { ...cloudEntitlements };
		state.poolUsage = 1;
		const result = await setConfigValuesImpl({
			scope: "prompt",
			id: "p-1",
			entries: [{ key: "run.model_mode", selector: { model: "claude" }, value: "web" }],
		});
		expect(result.written).toBe(1);
	});

	it("skips the pool check for a disabled prompt (the enable transition re-checks)", async () => {
		state.selectResults = [[{ id: "p-1", brandId: "brand-1", enabled: false, organizationId: "org-real" }]];
		state.entitlements = { ...cloudEntitlements };
		state.poolUsage = 1;
		const result = await setConfigValuesImpl({
			scope: "prompt",
			id: "p-1",
			entries: [{ key: "run.model_mode", selector: { model: "claude" }, value: "web" }],
		});
		expect(result.written).toBe(1);
	});

	it("treats model_enabled=true on an assignable model as a pool-consuming addition", async () => {
		state.selectResults = [ENABLED_PROMPT_ROW, []];
		state.entitlements = { ...cloudEntitlements };
		state.poolUsage = 1;
		await expect(
			setConfigValuesImpl({
				scope: "prompt",
				id: "p-1",
				entries: [{ key: "run.model_enabled", selector: { model: "claude" }, value: true }],
			}),
		).rejects.toThrow(/Claude pool/);
	});

	it("never pool-checks a model subtract (model_enabled=false)", async () => {
		state.selectResults = [ENABLED_PROMPT_ROW];
		state.entitlements = { ...cloudEntitlements };
		state.poolUsage = 1;
		const result = await setConfigValuesImpl({
			scope: "prompt",
			id: "p-1",
			entries: [{ key: "run.model_enabled", selector: { model: "claude" }, value: false }],
		});
		expect(result.written).toBe(1);
	});
});
