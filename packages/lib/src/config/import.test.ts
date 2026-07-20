import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ensureInstanceConfig talks to Postgres through drizzle; mock the db module
// (same pattern as ../secrets/store.test.ts) so the import flow is testable
// with no database. Inserted model_targets rows are materialized into
// `dbState.catalog` so the post-import deprecation check reads what a real
// transaction would have committed.
const dbState = vi.hoisted(() => ({
	hasMeta: false,
	users: [] as { id: string; role: string | null }[],
	catalog: [] as { model: string; provider: string; version: string | null; webSearch: boolean }[],
	inserts: [] as { table: string; values: unknown }[],
	updates: [] as { table: string; values: unknown }[],
	locks: 0,
}));

vi.mock("../db/db", async () => {
	const { getTableName } = await import("drizzle-orm");
	const nameOf = (table: unknown) => getTableName(table as Parameters<typeof getTableName>[0]);
	const rowsFor = (table: unknown): unknown[] => {
		switch (nameOf(table)) {
			case "instance_meta":
				return dbState.hasMeta ? [{ id: "instance" }] : [];
			case "user":
				return dbState.users;
			case "model_targets":
				return dbState.catalog;
			default:
				return [];
		}
	};
	const makeDb = (): Record<string, unknown> => ({
		execute: async () => {
			dbState.locks += 1;
			return { rows: [] };
		},
		select: () => ({
			from: (table: unknown) => ({
				where: () => Promise.resolve(rowsFor(table)),
				limit: (n: number) => Promise.resolve(rowsFor(table).slice(0, n)),
			}),
		}),
		insert: (table: unknown) => ({
			values: async (values: unknown) => {
				const tableName = nameOf(table);
				dbState.inserts.push({ table: tableName, values });
				if (tableName === "instance_meta") dbState.hasMeta = true;
				if (tableName === "model_targets") {
					const rows = (Array.isArray(values) ? values : [values]) as {
						model: string;
						provider: string;
						version: string | null;
						webSearch: boolean;
					}[];
					for (const row of rows) {
						dbState.catalog.push({
							model: row.model,
							provider: row.provider,
							version: row.version ?? null,
							webSearch: row.webSearch,
						});
					}
				}
			},
		}),
		update: (table: unknown) => ({
			set: (values: unknown) => ({
				where: async () => {
					dbState.updates.push({ table: nameOf(table), values });
				},
			}),
		}),
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb()),
	});
	return { db: makeDb() };
});

import { ensureInstanceConfig, ensureLocalInstanceAdmin, envMatchesCatalog, parseEnvScrapeTargets } from "./import";

function insertsInto(table: string) {
	return dbState.inserts.filter((entry) => entry.table === table);
}

beforeEach(() => {
	dbState.hasMeta = false;
	dbState.users = [];
	dbState.catalog = [];
	dbState.inserts = [];
	dbState.updates = [];
	dbState.locks = 0;
	// Deterministic env: not local (no promotion) and no legacy vars unless a
	// test opts in.
	vi.stubEnv("DEPLOYMENT_MODE", "whitelabel");
	vi.stubEnv("SCRAPE_TARGETS", undefined);
	vi.stubEnv("DEFAULT_DELAY_HOURS", undefined);
	vi.stubEnv("ONBOARDING_LLM_TARGET", undefined);
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("parseEnvScrapeTargets", () => {
	it("parses each comma-separated entry individually", () => {
		const { targets, skipped } = parseEnvScrapeTargets(
			"chatgpt:olostep:online, claude:anthropic-api:claude-sonnet-4-6",
		);
		expect(skipped).toEqual([]);
		expect(targets).toEqual([
			{ model: "chatgpt", provider: "olostep", version: undefined, webSearch: true },
			{ model: "claude", provider: "anthropic-api", version: "claude-sonnet-4-6", webSearch: false },
		]);
	});

	it("skips individually invalid entries without dropping the valid ones", () => {
		const { targets, skipped } = parseEnvScrapeTargets("chatgpt:olostep,badentry,,gemini:brightdata:online");
		expect(targets.map((target) => target.model)).toEqual(["chatgpt", "gemini"]);
		expect(skipped).toEqual(["badentry", ""]);
	});

	it("dedupes entries with the same identity tuple", () => {
		const { targets } = parseEnvScrapeTargets("chatgpt:olostep:online,chatgpt:olostep:online");
		expect(targets).toHaveLength(1);
	});

	it("keeps colons inside version slugs (OpenRouter variants)", () => {
		const { targets } = parseEnvScrapeTargets("deepseek:openrouter:deepseek/deepseek-v3.2:free");
		expect(targets).toEqual([
			{ model: "deepseek", provider: "openrouter", version: "deepseek/deepseek-v3.2:free", webSearch: false },
		]);
	});

	it("returns nothing for unset or blank input", () => {
		expect(parseEnvScrapeTargets(undefined)).toEqual({ targets: [], skipped: [] });
		expect(parseEnvScrapeTargets("   ")).toEqual({ targets: [], skipped: [] });
	});
});

describe("envMatchesCatalog", () => {
	const chatgpt = { model: "chatgpt", provider: "olostep", version: undefined, webSearch: true };
	const claude = { model: "claude", provider: "anthropic-api", version: "claude-sonnet-4-6", webSearch: false };

	it("matches regardless of order, normalizing undefined and null versions", () => {
		const catalog = [
			{ model: "claude", provider: "anthropic-api", version: "claude-sonnet-4-6", webSearch: false },
			{ model: "chatgpt", provider: "olostep", version: null, webSearch: true },
		];
		expect(envMatchesCatalog([chatgpt, claude], catalog)).toBe(true);
	});

	it("detects a missing catalog row", () => {
		expect(envMatchesCatalog([chatgpt, claude], [{ ...chatgpt, version: null }])).toBe(false);
	});

	it("detects extra catalog rows (targets added in the app)", () => {
		const catalog = [
			{ model: "chatgpt", provider: "olostep", version: null, webSearch: true },
			{ model: "grok", provider: "openrouter", version: "x-ai/grok-4.5", webSearch: true },
		];
		expect(envMatchesCatalog([chatgpt], catalog)).toBe(false);
	});

	it("treats a webSearch flip as divergence", () => {
		expect(
			envMatchesCatalog([chatgpt], [{ model: "chatgpt", provider: "olostep", version: null, webSearch: false }]),
		).toBe(false);
	});
});

describe("ensureInstanceConfig — fresh database", () => {
	it("imports SCRAPE_TARGETS into model_targets and stamps envImportedAt", async () => {
		vi.stubEnv("SCRAPE_TARGETS", "chatgpt:olostep:online,claude:anthropic-api:claude-sonnet-4-6");

		const result = await ensureInstanceConfig();

		expect(result).toEqual({ imported: true, targetsImported: 2, skippedEntries: [], promotedUserId: null });
		expect(dbState.locks).toBe(1);

		const [targetInsert] = insertsInto("model_targets");
		expect(targetInsert.values).toEqual([
			{ organizationId: null, model: "chatgpt", provider: "olostep", version: null, webSearch: true, enabled: true },
			{
				organizationId: null,
				model: "claude",
				provider: "anthropic-api",
				version: "claude-sonnet-4-6",
				webSearch: false,
				enabled: true,
			},
		]);

		const [metaInsert] = insertsInto("instance_meta");
		expect(metaInsert.values).toMatchObject({ id: "instance" });
		expect((metaInsert.values as { envImportedAt: unknown }).envImportedAt).toBeInstanceOf(Date);

		expect(insertsInto("configs")).toHaveLength(0);
		// env ≡ catalog right after import, so no deprecation warning.
		expect(console.warn).not.toHaveBeenCalled();
		expect(console.log).toHaveBeenCalledTimes(1);
	});

	it("imports with no SCRAPE_TARGETS at all (empty catalog, meta still stamped)", async () => {
		const result = await ensureInstanceConfig();

		expect(result.imported).toBe(true);
		expect(result.targetsImported).toBe(0);
		expect(insertsInto("model_targets")).toHaveLength(0);
		expect(insertsInto("instance_meta")).toHaveLength(1);
		expect(console.warn).not.toHaveBeenCalled();
	});

	it("skips invalid entries with one warn each and imports the rest", async () => {
		vi.stubEnv("SCRAPE_TARGETS", "chatgpt:olostep,notarget,");

		const result = await ensureInstanceConfig();

		expect(result.imported).toBe(true);
		expect(result.targetsImported).toBe(1);
		expect(result.skippedEntries).toEqual(["notarget", ""]);
		// One warn per skipped entry; no deprecation warn (valid entries ≡ catalog).
		expect(console.warn).toHaveBeenCalledTimes(2);
		expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain("notarget");
	});

	it("writes run.cadence_hours only when DEFAULT_DELAY_HOURS differs from the registry default", async () => {
		vi.stubEnv("DEFAULT_DELAY_HOURS", "12");

		await ensureInstanceConfig();

		const [configInsert] = insertsInto("configs");
		expect(configInsert.values).toEqual([{ scope: "instance", key: "run.cadence_hours", value: 12 }]);
	});

	it.each([
		["equal to the default", "24"],
		["unparseable", "abc"],
		["non-positive", "0"],
	])("writes no run.cadence_hours row when DEFAULT_DELAY_HOURS is %s", async (_label, raw) => {
		vi.stubEnv("DEFAULT_DELAY_HOURS", raw);

		await ensureInstanceConfig();

		expect(insertsInto("configs")).toHaveLength(0);
	});

	it("imports ONBOARDING_LLM_TARGET as the onboarding.target instance row", async () => {
		vi.stubEnv("ONBOARDING_LLM_TARGET", "claude:anthropic-api");

		await ensureInstanceConfig();

		const [configInsert] = insertsInto("configs");
		expect(configInsert.values).toEqual([
			{ scope: "instance", key: "onboarding.target", value: "claude:anthropic-api" },
		]);
	});
});

describe("ensureInstanceConfig — subsequent boots", () => {
	it("short-circuits on the second call without re-importing", async () => {
		vi.stubEnv("SCRAPE_TARGETS", "chatgpt:olostep:online");

		const first = await ensureInstanceConfig();
		const second = await ensureInstanceConfig();

		expect(first.imported).toBe(true);
		expect(second).toEqual({ imported: false, targetsImported: 0, skippedEntries: [], promotedUserId: null });
		expect(insertsInto("model_targets")).toHaveLength(1);
		expect(insertsInto("instance_meta")).toHaveLength(1);
		// Unchanged env still matches the catalog: no deprecation warn.
		expect(console.warn).not.toHaveBeenCalled();
	});

	it("warns exactly once when a still-set SCRAPE_TARGETS diverges from the catalog", async () => {
		dbState.hasMeta = true;
		dbState.catalog = [{ model: "chatgpt", provider: "olostep", version: null, webSearch: true }];
		vi.stubEnv("SCRAPE_TARGETS", "chatgpt:brightdata:online");

		const result = await ensureInstanceConfig();

		expect(result.imported).toBe(false);
		expect(console.warn).toHaveBeenCalledTimes(1);
		expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain("authoritative");
		expect(insertsInto("model_targets")).toHaveLength(0);
	});

	it("stays silent when env still matches the catalog", async () => {
		dbState.hasMeta = true;
		dbState.catalog = [{ model: "chatgpt", provider: "olostep", version: null, webSearch: true }];
		vi.stubEnv("SCRAPE_TARGETS", "chatgpt:olostep:online");

		await ensureInstanceConfig();

		expect(console.warn).not.toHaveBeenCalled();
	});

	it("promotes the sole local user even when the import already ran", async () => {
		dbState.hasMeta = true;
		dbState.users = [{ id: "u1", role: null }];
		vi.stubEnv("DEPLOYMENT_MODE", "local");

		const result = await ensureInstanceConfig();

		expect(result.promotedUserId).toBe("u1");
		expect(dbState.updates).toEqual([{ table: "user", values: { role: "admin" } }]);
	});
});

describe("ensureLocalInstanceAdmin", () => {
	it("promotes the sole non-admin user in local mode", async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		dbState.users = [{ id: "u1", role: "user" }];

		expect(await ensureLocalInstanceAdmin()).toBe("u1");
		expect(dbState.updates).toEqual([{ table: "user", values: { role: "admin" } }]);
	});

	it("does nothing when the sole user is already admin", async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		dbState.users = [{ id: "u1", role: "admin" }];

		expect(await ensureLocalInstanceAdmin()).toBeNull();
		expect(dbState.updates).toEqual([]);
	});

	it("does nothing with zero or multiple users", async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");

		expect(await ensureLocalInstanceAdmin()).toBeNull();

		dbState.users = [
			{ id: "u1", role: null },
			{ id: "u2", role: null },
		];
		expect(await ensureLocalInstanceAdmin()).toBeNull();
		expect(dbState.updates).toEqual([]);
	});

	it("never promotes in demo mode", async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "demo");
		dbState.users = [{ id: "u1", role: null }];

		expect(await ensureLocalInstanceAdmin()).toBeNull();
		expect(dbState.updates).toEqual([]);
	});

	it("never promotes when DEPLOYMENT_MODE is unset or invalid", async () => {
		dbState.users = [{ id: "u1", role: null }];

		vi.stubEnv("DEPLOYMENT_MODE", undefined);
		expect(await ensureLocalInstanceAdmin()).toBeNull();

		vi.stubEnv("DEPLOYMENT_MODE", "not-a-mode");
		expect(await ensureLocalInstanceAdmin()).toBeNull();
		expect(dbState.updates).toEqual([]);
	});
});
