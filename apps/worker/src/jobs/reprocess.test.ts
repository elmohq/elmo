import { type MentionConfig, mentionsStamp } from "@workspace/lib/mentions";
import { EXTRACTOR_VERSION } from "@workspace/lib/text-extraction";
import { describe, expect, it } from "vitest";
import { type BrandMentions, brandVersions, buildRowUpdate, type RunHead, staleLayers } from "./reprocess";

const config: MentionConfig = {
	brand: { name: "Acme", aliases: [], domains: ["https://acme.com"] },
	competitors: [],
};
const mentions: BrandMentions = { config, stamp: mentionsStamp(config) };

const baseRow: RunHead = {
	id: "run-1",
	promptId: "prompt-1",
	createdAt: new Date("2026-01-15T10:05:00.000Z"),
	cursorAt: "2026-01-15T10:05:00.000000Z",
	model: "gpt-5",
	provider: "openai-api",
	hasText: false,
	extractorVersion: null,
	analysisVersions: {},
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
		expect(buildRowUpdate(baseRow, { extraction: false, mentions: false }, {}, mentions)).toBeNull();
	});

	it("re-extracts text and citations without touching mentions when only extraction is stale", () => {
		const raw = openAiPayload("Acme is great.");
		const update = buildRowUpdate(baseRow, { extraction: true, mentions: false }, { raw }, mentions);
		expect(update?.columns.textContent).toBe("Acme is great.");
		expect(update?.columns.extractorVersion).toBe(EXTRACTOR_VERSION);
		expect(update?.citations).toEqual([
			{ url: "https://example.com/a", title: "A", domain: "example.com", citationIndex: 0 },
		]);
		expect(update?.columns.brandMentioned).toBeUndefined();
		expect(update?.columns.analysisVersions).toBeUndefined();
	});

	it("fills missing text for stale mentions without touching citations or the extractor stamp", () => {
		const raw = openAiPayload("Acme is great.");
		const update = buildRowUpdate(baseRow, { extraction: false, mentions: true }, { raw }, mentions);
		expect(update?.columns.textContent).toBe("Acme is great.");
		expect(update?.columns.extractorVersion).toBeUndefined();
		expect(update?.citations).toBeUndefined();
		expect(update?.columns.brandMentioned).toBe(true);
		expect(update?.columns.analysisVersions).toBeDefined();
	});

	it("derives mentions from stored text when the run already has it", () => {
		const row = { ...baseRow, hasText: true };
		const update = buildRowUpdate(
			row,
			{ extraction: false, mentions: true },
			{ text: "Acme is already stored here." },
			mentions,
		);
		expect(update?.columns.textContent).toBeUndefined();
		expect(update?.columns.brandMentioned).toBe(true);
	});

	it("derives mentions from freshly extracted text when both layers are stale", () => {
		const raw = openAiPayload("No brand mention here.");
		const row = { ...baseRow, hasText: true };
		const update = buildRowUpdate(row, { extraction: true, mentions: true }, { raw }, mentions);
		expect(update?.columns.textContent).toBe("No brand mention here.");
		expect(update?.citations).toHaveLength(1);
		expect(update?.columns.brandMentioned).toBe(false);
	});
});

describe("staleLayers", () => {
	const current = brandVersions(config);

	it("asks for nothing when history matches today's code and config", () => {
		expect(staleLayers(current, current)).toEqual([]);
	});

	it("re-derives mentions alone after a config change", () => {
		const moved = brandVersions({ ...config, brand: { ...config.brand, aliases: ["Acme Corp"] } });
		expect(staleLayers(current, moved)).toEqual(["interpretation"]);
	});

	it("brings interpretation along with extraction, since new text changes what is found", () => {
		expect(staleLayers({ ...current, extraction: "0" }, current)).toEqual(["extraction", "interpretation"]);
	});
});
