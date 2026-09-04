import type { BrandContext } from "@workspace/lib/derivers";
import { mentionsDeriver } from "@workspace/lib/derivers";
import { EXTRACTOR_VERSION } from "@workspace/lib/text-extraction";
import { describe, expect, it } from "vitest";
import { buildRowUpdate } from "./reprocess";

const ctx: BrandContext = {
	brand: { name: "Acme", aliases: [], website: "https://acme.com", additionalDomains: [] },
	competitors: [],
};

const baseRow = {
	id: "run-1",
	promptId: "prompt-1",
	createdAt: new Date("2026-01-15T10:05:00.000Z"),
	model: "gpt-5",
	provider: "openai-api",
	textContent: null as string | null,
	extractorVersion: null as number | null,
	analysisVersions: {} as Record<string, string>,
};

const openAiPayload = (text: string) => ({
	output: [
		{
			type: "message",
			content: [
				{
					type: "output_text",
					text,
					annotations: [{ type: "url_citation", url: "https://example.com/a", title: "A" }],
				},
			],
		},
	],
});

describe("buildRowUpdate", () => {
	it("returns null when nothing is stale", () => {
		const update = buildRowUpdate(
			{ row: baseRow, stale: [], plan: { needsExtraction: false, needsRaw: false } },
			undefined,
			ctx,
		);
		expect(update).toBeNull();
	});

	it("re-extracts text and citations when extraction is stale and raw is available", () => {
		const raw = openAiPayload("Acme is great.");
		const update = buildRowUpdate(
			{ row: baseRow, stale: [], plan: { needsExtraction: true, needsRaw: true } },
			raw,
			ctx,
		);
		expect(update?.columns.textContent).toBe("Acme is great.");
		expect(update?.columns.extractorVersion).toBe(EXTRACTOR_VERSION);
		expect(update?.citations).toEqual([
			{ url: "https://example.com/a", title: "A", domain: "example.com", citationIndex: 0 },
		]);
		// Extraction alone (no stale derivers) touches no interpreted columns.
		expect(update?.columns.brandMentioned).toBeUndefined();
		expect(update?.columns.analysisVersions).toBeUndefined();
	});

	it("returns null when extraction is stale but raw was not fetched for it", () => {
		const update = buildRowUpdate(
			{ row: baseRow, stale: [], plan: { needsExtraction: true, needsRaw: true } },
			undefined,
			ctx,
		);
		expect(update).toBeNull();
	});

	it("lazily fills missing text for a stale text deriver without touching citations or the extractor stamp", () => {
		const raw = openAiPayload("Acme is great.");
		const update = buildRowUpdate(
			{ row: baseRow, stale: [mentionsDeriver], plan: { needsExtraction: false, needsRaw: true } },
			raw,
			ctx,
		);
		expect(update?.columns.textContent).toBe("Acme is great.");
		expect(update?.columns.extractorVersion).toBeUndefined();
		expect(update?.citations).toBeUndefined();
		// The freshly-filled text feeds the deriver in the same pass.
		expect(update?.columns.brandMentioned).toBe(true);
		expect(update?.columns.analysisVersions).toBeDefined();
	});

	it("does not fetch or fill text when text_content is already present, and derives from the stored text", () => {
		const row = { ...baseRow, textContent: "Acme is already stored here." };
		const update = buildRowUpdate(
			{ row, stale: [mentionsDeriver], plan: { needsExtraction: false, needsRaw: false } },
			undefined,
			ctx,
		);
		expect(update?.columns.textContent).toBeUndefined();
		expect(update?.columns.extractorVersion).toBeUndefined();
		expect(update?.columns.brandMentioned).toBe(true);
		expect(update?.columns.analysisVersions).toBeDefined();
	});

	it("combines extraction and interpretation in one pass, deriving from the freshly extracted text", () => {
		const raw = openAiPayload("No brand mention here.");
		const update = buildRowUpdate(
			{ row: baseRow, stale: [mentionsDeriver], plan: { needsExtraction: true, needsRaw: true } },
			raw,
			ctx,
		);
		expect(update?.columns.textContent).toBe("No brand mention here.");
		expect(update?.citations).toHaveLength(1);
		expect(update?.columns.brandMentioned).toBe(false);
		expect(update?.columns.analysisVersions).toBeDefined();
	});
});
