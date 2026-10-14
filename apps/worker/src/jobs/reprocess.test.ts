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
	analysisVersions: {},
});

describe("deriveRunUpdate", () => {
	it("re-extracts text and citations, then derives mentions from the new text", () => {
		const update = deriveRunUpdate(legacyRun("Acme is great."), ["extraction", "interpretation"], target, config);
		expect(update.columns).toEqual({ textContent: "Acme is great.", brandMentioned: true, competitorsMentioned: [] });
		expect(update.citations).toEqual([
			{ url: "https://example.com/a", title: "A", domain: "example.com", citationIndex: 0 },
		]);
		expect(update.stamps).toEqual(target);
	});

	it("fills a legacy run's text for mentions but leaves its citations and extraction stamp alone", () => {
		const update = deriveRunUpdate(legacyRun("Acme is great."), ["interpretation"], target, config);
		expect(update.columns.textContent).toBe("Acme is great.");
		expect(update.columns.brandMentioned).toBe(true);
		expect(update.citations).toBeUndefined();
		expect(update.stamps).toEqual({ [MENTIONS_KEY]: target[MENTIONS_KEY] });
	});

	it("derives mentions from stored text without re-extracting", () => {
		const run = { ...legacyRun("ignored"), textContent: "Acme is stored here.", rawOutput: null };
		const update = deriveRunUpdate(run, ["interpretation"], target, config);
		expect(update.columns).toEqual({ brandMentioned: true, competitorsMentioned: [] });
	});

	it("leaves a layer that is already current alone", () => {
		const run = {
			...legacyRun("Acme"),
			textContent: "Acme",
			analysisVersions: { [EXTRACTION_KEY]: target[EXTRACTION_KEY] },
		};
		const update = deriveRunUpdate(run, ["extraction", "interpretation"], target, config);
		expect(update.citations).toBeUndefined();
		expect(update.stamps).toEqual({ [MENTIONS_KEY]: target[MENTIONS_KEY] });
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
