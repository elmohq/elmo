import { currentAnalysisVersions, EXTRACTION_KEY, MENTIONS_KEY } from "@workspace/lib/analysis-versions";
import type { MentionConfig } from "@workspace/lib/mentions";
import { describe, expect, it } from "vitest";
import { deriveRunUpdate, type StaleRun, staleLayers } from "./reprocess";

const config: MentionConfig = {
	brand: { name: "Acme", aliases: [], domains: ["https://acme.com"] },
	competitors: [],
};
const target = currentAnalysisVersions(config);

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

const legacyRun = (text: string): StaleRun => ({
	id: "run-1",
	promptId: "prompt-1",
	createdAt: new Date("2026-01-15T10:05:00.000Z"),
	model: "gpt-5",
	provider: "openai-api",
	textContent: null,
	rawOutput: openAiPayload(text),
	stamps: {},
	brandMentioned: false,
	competitorsMentioned: [],
	citationCount: 0,
});

describe("deriveRunUpdate", () => {
	it("re-extracts text and citations, then derives mentions from the new text", () => {
		const update = deriveRunUpdate(legacyRun("Acme is great."), ["extraction", "interpretation"], target, config);
		expect(update.extraction).toEqual({ textContent: "Acme is great.", stamp: target[EXTRACTION_KEY] });
		expect(update.mentions).toEqual({ brandMentioned: true, competitorsMentioned: [], stamp: target[MENTIONS_KEY] });
		expect(update.citations).toEqual([
			{ url: "https://example.com/a", title: "A", domain: "example.com", citationIndex: 0 },
		]);
	});

	it("fills a legacy run's text for mentions but leaves its citations and extraction stamp alone", () => {
		const update = deriveRunUpdate(legacyRun("Acme is great."), ["interpretation"], target, config);
		expect(update.extraction).toEqual({ textContent: "Acme is great.", stamp: null });
		expect(update.mentions?.brandMentioned).toBe(true);
		expect(update.citations).toBeUndefined();
	});

	it("derives mentions from stored text without re-extracting", () => {
		const run = { ...legacyRun("ignored"), textContent: "Acme is stored here.", rawOutput: null };
		const update = deriveRunUpdate(run, ["interpretation"], target, config);
		expect(update.extraction).toBeUndefined();
		expect(update.mentions).toEqual({ brandMentioned: true, competitorsMentioned: [], stamp: target[MENTIONS_KEY] });
	});

	it("leaves a layer that is already current alone", () => {
		const run = {
			...legacyRun("Acme"),
			textContent: "Acme",
			stamps: { [EXTRACTION_KEY]: target[EXTRACTION_KEY] },
		};
		const update = deriveRunUpdate(run, ["extraction", "interpretation"], target, config);
		expect(update.extraction).toBeUndefined();
		expect(update.citations).toBeUndefined();
		expect(update.mentions?.stamp).toBe(target[MENTIONS_KEY]);
	});
});

describe("deriveRunUpdate on a payload that yields less than the run has", () => {
	// What older code stored when it trimmed the response before extracting from it.
	const emptied = { ...legacyRun("unused"), rawOutput: {} };

	it("keeps stored text and citations instead of replacing them with nothing", () => {
		const run = { ...emptied, textContent: "Acme is great.", citationCount: 3 };
		const update = deriveRunUpdate(run, ["extraction", "interpretation"], target, config);
		expect(update.kept).toEqual(["text", "citations"]);
		expect(update.extraction).toEqual({ textContent: "Acme is great.", stamp: target[EXTRACTION_KEY] });
		expect(update.citations).toBeUndefined();
		expect(update.mentions?.brandMentioned).toBe(true);
	});

	it("keeps a legacy run's mentions when there is no text to derive them from", () => {
		const run = { ...emptied, brandMentioned: true, competitorsMentioned: ["Globex"] };
		const update = deriveRunUpdate(run, ["interpretation"], target, config);
		expect(update.kept).toEqual(["mentions"]);
		expect(update.mentions).toEqual({
			brandMentioned: true,
			competitorsMentioned: ["Globex"],
			stamp: target[MENTIONS_KEY],
		});
	});

	it("still records an empty result for a run that never had anything", () => {
		const update = deriveRunUpdate(emptied, ["extraction", "interpretation"], target, config);
		expect(update.kept).toEqual([]);
		expect(update.citations).toEqual([]);
		expect(update.mentions?.brandMentioned).toBe(false);
	});
});

describe("staleLayers", () => {
	it("asks for nothing when history matches today's code and config", () => {
		expect(staleLayers(target, target)).toEqual([]);
	});

	it("re-derives mentions alone after a config change", () => {
		const moved = currentAnalysisVersions({ ...config, brand: { ...config.brand, aliases: ["Acme Corp"] } });
		expect(staleLayers(target, moved)).toEqual(["interpretation"]);
	});

	it("brings interpretation along with extraction, since new text changes what is found", () => {
		expect(staleLayers({ ...target, [EXTRACTION_KEY]: "0" }, target)).toEqual(["extraction", "interpretation"]);
	});
});
