import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: vi.fn().mockResolvedValue(true),
	removePromptJobScheduler: vi.fn().mockResolvedValue(true),
}));

// Use vi.hoisted so mockDb and state are initialized before vi.mock factories run.
const { mockDb, state } = vi.hoisted(() => {
	const state = {
		results: [] as unknown[],
		ops: [] as Array<{ kind: string; table?: unknown; values?: unknown; set?: unknown }>,
	};

	const next = () => (state.results.length ? state.results.shift() : []);

	function chain(): any {
		const c: any = {
			from: () => c,
			where: () => c,
			orderBy: () => c,
			limit: () => c,
			offset: () => c,
			returning: () => Promise.resolve(next()),
			then: (res: any, rej: any) => Promise.resolve(next()).then(res, rej),
		};
		return c;
	}

	const mockDb: any = {
		select: () => chain(),
		insert: (t: unknown) => ({
			values: (v: unknown) => {
				state.ops.push({ kind: "insert", table: t, values: v });
				return {
					returning: () => Promise.resolve(next()),
					then: (r: any, j: any) => Promise.resolve(next()).then(r, j),
				};
			},
		}),
		update: (t: unknown) => ({
			set: (v: unknown) => {
				state.ops.push({ kind: "update", table: t, set: v });
				return chain();
			},
		}),
		delete: (t: unknown) => {
			state.ops.push({ kind: "delete", table: t });
			return chain();
		},
		transaction: async (cb: any) => cb(mockDb),
	};

	return { mockDb, state };
});

vi.mock("@workspace/lib/db/db", () => ({ db: mockDb }));

import { brands, citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { createPromptJobScheduler, removePromptJobScheduler } from "@/lib/job-scheduler";
import { BrandNotFoundError } from "@/server/onboarding-core";
import {
	createPrompt,
	deletePrompt,
	getPromptById,
	listPrompts,
	PromptNotFoundError,
	updatePrompt,
} from "@/server/prompts-core";

beforeEach(() => {
	state.results = [];
	state.ops = [];
	vi.clearAllMocks();
});

const NOW = new Date("2026-01-01T00:00:00Z");

const BRAND = { id: "b1", name: "Acme", website: "https://acme.com" };

const PROMPT_ROW = {
	id: "p1",
	brandId: "b1",
	value: "best tool for Acme",
	enabled: true,
	tags: [],
	systemTags: ["branded"],
	createdAt: NOW,
	updatedAt: NOW,
};

describe("createPrompt", () => {
	it("happy path: inserts with correct values and calls scheduler", async () => {
		state.results = [[BRAND], [PROMPT_ROW]];

		const result = await createPrompt({ brandId: "b1", value: "best tool for Acme", tags: ["MY TAG"] });

		expect(result).toEqual(PROMPT_ROW);

		const insertOp = state.ops.find((o) => o.kind === "insert");
		expect(insertOp).toBeDefined();
		const vals = insertOp!.values as any;
		expect(vals.enabled).toBe(true);
		expect(vals.tags).toEqual(["my tag"]); // sanitizeUserTags lowercases
		expect(vals.systemTags).toEqual(computeSystemTags("best tool for Acme", "Acme", "https://acme.com"));

		expect(createPromptJobScheduler).toHaveBeenCalledOnce();
		expect(createPromptJobScheduler).toHaveBeenCalledWith("p1");
	});

	it("brand missing: throws BrandNotFoundError, scheduler not called", async () => {
		state.results = [[]]; // brand lookup returns empty

		await expect(createPrompt({ brandId: "b1", value: "test" })).rejects.toThrow(BrandNotFoundError);
		expect(createPromptJobScheduler).not.toHaveBeenCalled();
	});
});

describe("getPromptById", () => {
	it("found: returns the prompt row", async () => {
		state.results = [[PROMPT_ROW]];

		const result = await getPromptById("p1");

		expect(result).toEqual(PROMPT_ROW);
	});

	it("not found: throws PromptNotFoundError", async () => {
		state.results = [[]];

		await expect(getPromptById("p1")).rejects.toThrow(PromptNotFoundError);
	});
});

describe("updatePrompt", () => {
	it("value change: captured set includes new value and recomputed systemTags", async () => {
		const newValue = "new prompt for Acme";
		state.results = [
			[{ ...PROMPT_ROW, value: "old value" }], // existing prompt
			[BRAND], // brand
			[{ ...PROMPT_ROW, value: newValue }], // updated prompt
		];

		await updatePrompt("p1", { value: newValue });

		const updateOp = state.ops.find((o) => o.kind === "update");
		expect(updateOp).toBeDefined();
		const set = updateOp!.set as any;
		expect(set.value).toBe(newValue);
		expect(set.systemTags).toEqual(computeSystemTags(newValue, "Acme", "https://acme.com"));
	});

	it("enable transition: false→true calls createPromptJobScheduler", async () => {
		state.results = [
			[{ ...PROMPT_ROW, enabled: false }],
			[BRAND],
			[{ ...PROMPT_ROW, enabled: true }],
		];

		await updatePrompt("p1", { enabled: true });

		expect(createPromptJobScheduler).toHaveBeenCalledOnce();
		expect(createPromptJobScheduler).toHaveBeenCalledWith("p1");
		expect(removePromptJobScheduler).not.toHaveBeenCalled();
	});

	it("enable transition: true→false calls removePromptJobScheduler", async () => {
		state.results = [
			[{ ...PROMPT_ROW, enabled: true }],
			[BRAND],
			[{ ...PROMPT_ROW, enabled: false }],
		];

		await updatePrompt("p1", { enabled: false });

		expect(removePromptJobScheduler).toHaveBeenCalledOnce();
		expect(removePromptJobScheduler).toHaveBeenCalledWith("p1");
		expect(createPromptJobScheduler).not.toHaveBeenCalled();
	});

	it("value-only update: neither scheduler called", async () => {
		state.results = [
			[{ ...PROMPT_ROW, enabled: true }],
			[BRAND],
			[{ ...PROMPT_ROW, value: "updated" }],
		];

		await updatePrompt("p1", { value: "updated" });

		expect(createPromptJobScheduler).not.toHaveBeenCalled();
		expect(removePromptJobScheduler).not.toHaveBeenCalled();
	});

	it("empty input: throws before any DB call", async () => {
		await expect(updatePrompt("p1", {})).rejects.toThrow(
			"At least one of value, enabled, or tags must be provided",
		);
		expect(state.ops).toHaveLength(0);
	});

	it("prompt missing: throws PromptNotFoundError", async () => {
		state.results = [[]];

		await expect(updatePrompt("p1", { value: "x" })).rejects.toThrow(PromptNotFoundError);
	});
});

describe("deletePrompt", () => {
	it("cascade: correct delete order, deletedRunsCount matches, scheduler called once", async () => {
		state.results = [
			[PROMPT_ROW], // existence check
			[], // citations delete (awaited, result discarded)
			[{ id: "r1" }, { id: "r2" }], // promptRuns delete returning
			[PROMPT_ROW], // prompts delete returning
		];

		const result = await deletePrompt("p1");

		expect(result.deletedRunsCount).toBe(2);

		expect(removePromptJobScheduler).toHaveBeenCalledOnce();
		expect(removePromptJobScheduler).toHaveBeenCalledWith("p1");

		const deleteOps = state.ops.filter((o) => o.kind === "delete");
		expect(deleteOps.map((o) => o.table)).toEqual([citations, promptRuns, prompts]);
	});

	it("prompt missing: throws PromptNotFoundError", async () => {
		state.results = [[]];

		await expect(deletePrompt("p1")).rejects.toThrow(PromptNotFoundError);
	});
});

describe("listPrompts", () => {
	it("pagination math: page 2 of 25 results at limit 10", async () => {
		const rows = Array.from({ length: 10 }, (_, i) => ({ ...PROMPT_ROW, id: `p${i + 1}` }));
		state.results = [[{ count: 25 }], rows];

		const result = await listPrompts({ page: 2, limit: 10 });

		expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
		expect(result.prompts).toEqual(rows);
	});
});
