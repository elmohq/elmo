import { describe, expect, it } from "vitest";
import { assembleBundle, type BrandChunk } from "@/lib/brand-data/chunks";
import { scopeRows } from "@/lib/brand-data/scope";
import { decodeBrandBundle, MissingChunksError } from "@/lib/brand-data/store";

const prompt = (id: string, value: string) => ({
	id,
	value,
	tags: [],
	systemTags: [],
	enabled: true,
	createdAt: "2026-01-01T00:00:00.000Z",
	firstEvaluatedAt: null,
});

const entities: BrandChunk = {
	id: "entities",
	version: "1",
	data: {
		kind: "entities",
		brand: { id: "b", name: "Acme", website: "https://acme.example", additionalDomains: [], delayOverrideHours: null },
		competitors: [],
		prompts: [prompt("p1", "best crm"), prompt("p2", "acme pricing")],
		apiProviderIds: [],
	},
};

const minutes = (iso: string) => Date.parse(iso) / 60_000;

const month = (
	id: string,
	promptIds: string[],
	models: string[],
	rows: [string, number, number, number][],
): BrandChunk => ({
	id,
	version: "1",
	data: {
		kind: "month",
		dicts: { promptIds, models, providers: [""], queries: ["crm"] },
		tables: {
			webQueries: {
				bucket: rows.map((r) => minutes(r[0])),
				prompt: rows.map((r) => r[1]),
				model: rows.map((r) => r[2]),
				provider: rows.map(() => 0),
				web: rows.map(() => 1),
				query: rows.map(() => 0),
				runs: rows.map((r) => r[3]),
				brandMentioned: rows.map(() => 0),
			},
		},
	},
});

const february = month("runs:2026-02", ["p1"], ["chatgpt"], [["2026-02-10T00:00:00Z", 0, 0, 2]]);
const march = month("runs:2026-03", ["p2", "p1"], ["claude", "chatgpt"], [["2026-03-10T00:00:00Z", 0, 1, 3]]);

describe("assembling a brand's chunks", () => {
	it("merges months in order and maps each chunk's dictionaries onto one", () => {
		const bundle = assembleBundle("b", [march, february, entities]);
		expect(bundle?.webQueries.bucket).toEqual([minutes("2026-02-10T00:00:00Z"), minutes("2026-03-10T00:00:00Z")]);
		expect(bundle?.webQueries.prompt.map((i) => bundle.prompts[i].id)).toEqual(["p1", "p2"]);
		expect(bundle?.webQueries.model.map((i) => bundle.dicts.models[i])).toEqual(["chatgpt", "chatgpt"]);
		expect(bundle?.webQueries.runs).toEqual([2, 3]);
	});

	it("drops rows for prompts the brand no longer has", () => {
		const gone = month("runs:2026-02", ["gone"], ["chatgpt"], [["2026-02-10T00:00:00Z", 0, 0, 2]]);
		expect(assembleBundle("b", [entities, gone])?.webQueries.bucket).toEqual([]);
	});

	it("has nothing to assemble without the brand's entities", () => {
		expect(assembleBundle("b", [february])).toBeNull();
	});
});

describe("reading a brand that is still syncing", () => {
	const available = new Set(["entities", "runs:2026-02", "runs:2026-03", "citations:2026-03", "pages:0", "pages:1"]);
	const store = (loaded: string[]) => {
		const chunks = [entities, february, march].filter((chunk) => loaded.includes(chunk.id));
		const bundle = assembleBundle("b", chunks);
		if (!bundle) throw new Error("No entities");
		return decodeBrandBundle(bundle, { available, loaded: new Set(loaded) });
	};
	const missing = (read: () => unknown) => {
		try {
			read();
		} catch (error) {
			if (error instanceof MissingChunksError) return error.chunkIds;
			throw error;
		}
		return [];
	};

	it("reads a window whose months have synced", () => {
		const synced = store(["entities", "runs:2026-03"]);
		const rows = scopeRows(synced, synced.webQueries, {
			brandId: "b",
			from: "2026-03-01",
			to: "2026-03-31",
			timezone: "UTC",
		});
		expect(rows.length).toBe(1);
	});

	it("asks for the months a window needs that haven't synced, including ones the viewer's timezone reaches into", () => {
		const synced = store(["entities", "runs:2026-03"]);
		const scope = { brandId: "b", from: "2026-03-01", to: "2026-03-31", timezone: "America/Los_Angeles" };
		expect(missing(() => scopeRows(synced, synced.webQueries, { ...scope, timezone: "Asia/Tokyo" }))).toEqual([
			"runs:2026-02",
		]);
		expect(missing(() => scopeRows(synced, synced.webQueries, scope))).toEqual([]);
		expect(
			missing(() => scopeRows(synced, synced.webQueries, { brandId: "b", from: null, to: null, timezone: "UTC" })),
		).toEqual(["runs:2026-02"]);
	});

	it("does not wait on months the brand has no data for", () => {
		const synced = store(["entities", "runs:2026-03"]);
		const scope = { brandId: "b", from: "2026-03-01", to: "2026-04-30", timezone: "UTC" };
		expect(missing(() => scopeRows(synced, synced.webQueries, scope))).toEqual([]);
	});

	it("waits for every cited page before reading citations", () => {
		const synced = store(["entities", "runs:2026-03", "citations:2026-03", "pages:1"]);
		const scope = { brandId: "b", from: "2026-03-01", to: "2026-03-31", timezone: "UTC" };
		expect(missing(() => scopeRows(synced, synced.citations, scope))).toEqual(["pages:0"]);
	});
});
