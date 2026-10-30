import { describe, expect, it } from "vitest";
import { type BrandChunk, decodeChunks, encodeChunks } from "@/lib/brand-data/chunks";
import { type Coverage, missingChunks } from "@/lib/brand-data/coverage";

describe("the chunk wire format", () => {
	it("carries entities and every table's bytes through unchanged", () => {
		const entities = {
			brand: {
				id: "b",
				name: "Acme",
				website: "https://acme.example",
				additionalDomains: [],
				delayOverrideHours: null,
			},
			competitors: [],
			prompts: [],
		};
		const chunks: BrandChunk[] = [
			{ id: "entities", version: "e1", entities },
			{
				id: "runs:2026-03",
				version: "1:2.3",
				tables: { rollup_prompt_runs: Uint8Array.of(1, 2, 3), rollup_web_queries: Uint8Array.of() },
			},
			{ id: "urls:0", version: "1:4.5", tables: { rollup_citation_pages: Uint8Array.of(9, 8) } },
		];
		expect(decodeChunks(encodeChunks(chunks))).toEqual(chunks);
	});
});

describe("reading a brand that is still syncing", () => {
	const coverage = (loaded: string[]): Coverage => ({
		available: new Set(["entities", "runs:2026-02", "runs:2026-03", "citations:2026-03", "pages:0", "pages:1"]),
		loaded: new Set(loaded),
	});
	const march = { brandId: "b", from: "2026-03-01", to: "2026-03-31", timezone: "UTC" };

	it("reads a window whose months have synced", () => {
		expect(missingChunks(coverage(["entities", "runs:2026-03"]), "runs", march)).toEqual([]);
	});

	it("asks for the months a window needs that haven't synced, including ones the viewer's timezone reaches into", () => {
		const synced = coverage(["entities", "runs:2026-03"]);
		expect(missingChunks(synced, "runs", { ...march, timezone: "Asia/Tokyo" })).toEqual(["runs:2026-02"]);
		expect(missingChunks(synced, "runs", { ...march, timezone: "America/Los_Angeles" })).toEqual([]);
		expect(missingChunks(synced, "runs", { brandId: "b", from: null, to: null, timezone: "UTC" })).toEqual([
			"runs:2026-02",
		]);
	});

	it("does not wait on months the brand has no data for", () => {
		expect(missingChunks(coverage(["entities", "runs:2026-03"]), "runs", { ...march, to: "2026-04-30" })).toEqual([]);
	});

	it("waits for every cited page before reading citations", () => {
		const synced = coverage(["entities", "citations:2026-03", "pages:1"]);
		expect(missingChunks(synced, "citations", march)).toEqual(["pages:0"]);
	});

	it("waits only for the days of the current month a window covers", () => {
		const days: Coverage = {
			available: new Set(["entities", "runs:2026-09", "runs:2026-10-01", "runs:2026-10-29", "runs:2026-10-30"]),
			loaded: new Set(["entities", "runs:2026-10-01"]),
		};
		const lastTwoDays = { brandId: "b", from: "2026-10-29", to: "2026-10-30", timezone: "UTC" };
		expect(missingChunks(days, "runs", lastTwoDays)).toEqual(["runs:2026-10-29", "runs:2026-10-30"]);
	});
});
