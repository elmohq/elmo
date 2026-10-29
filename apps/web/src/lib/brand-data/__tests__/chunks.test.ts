import { describe, expect, it } from "vitest";
import { assembleBundle, type BrandChunk, manifestVersion } from "@/lib/brand-data/chunks";

const entities: BrandChunk = {
	id: "entities",
	hash: "1",
	data: {
		kind: "entities",
		brand: { id: "b", name: "Acme", website: "https://acme.example", additionalDomains: [], delayOverrideHours: null },
		competitors: [],
		prompts: [
			{ id: "p1", value: "best crm", tags: [], systemTags: [], enabled: true, createdAt: "2026-01-01T00:00:00.000Z" },
			{
				id: "p2",
				value: "acme pricing",
				tags: [],
				systemTags: [],
				enabled: true,
				createdAt: "2026-01-02T00:00:00.000Z",
			},
		],
		apiProviderIds: [],
	},
};

const month = (
	id: string,
	promptIds: string[],
	models: string[],
	rows: [number, number, number, number][],
): BrandChunk => ({
	id,
	hash: "1",
	data: {
		kind: "run",
		table: "webQueries",
		dicts: { promptIds, models, providers: [""], queries: ["crm"] },
		columns: {
			bucket: rows.map((r) => r[0]),
			prompt: rows.map((r) => r[1]),
			model: rows.map((r) => r[2]),
			provider: rows.map(() => 0),
			web: rows.map(() => 1),
			query: rows.map(() => 0),
			runs: rows.map((r) => r[3]),
			brandMentioned: rows.map(() => 0),
		},
	},
});

describe("assembling a brand's chunks", () => {
	it("merges months in order and maps each chunk's dictionaries onto one", () => {
		const bundle = assembleBundle("b", "v", [
			month("webQueries:2026-02", ["p2", "p1"], ["claude", "chatgpt"], [[10, 0, 1, 3]]),
			month("webQueries:2026-01", ["p1"], ["chatgpt"], [[5, 0, 0, 2]]),
			entities,
		]);
		expect(bundle?.webQueries.bucket).toEqual([5, 10]);
		expect(bundle?.webQueries.prompt.map((i) => bundle.prompts[i].id)).toEqual(["p1", "p2"]);
		expect(bundle?.webQueries.model.map((i) => bundle.dicts.models[i])).toEqual(["chatgpt", "chatgpt"]);
		expect(bundle?.webQueries.runs).toEqual([2, 3]);
	});

	it("drops rows for prompts the brand no longer has", () => {
		const bundle = assembleBundle("b", "v", [
			entities,
			month("webQueries:2026-01", ["gone"], ["chatgpt"], [[5, 0, 0, 2]]),
		]);
		expect(bundle?.webQueries.bucket).toEqual([]);
	});

	it("has nothing to assemble without the brand's entities", () => {
		expect(assembleBundle("b", "v", [month("webQueries:2026-01", ["p1"], ["chatgpt"], [[5, 0, 0, 2]])])).toBeNull();
	});

	it("versions the whole set from its chunks, in any order", () => {
		const a = [
			{ id: "entities", hash: "1" },
			{ id: "webQueries:2026-01", hash: "2" },
		];
		expect(manifestVersion(a)).toBe(manifestVersion([...a].reverse()));
		expect(manifestVersion(a)).not.toBe(manifestVersion([{ ...a[0], hash: "3" }, a[1]]));
	});
});
