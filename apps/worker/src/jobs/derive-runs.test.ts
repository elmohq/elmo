import { currentAnalysisVersions, EXTRACTION_KEY, MENTIONS_KEY } from "@workspace/lib/analysis-versions";
import type { MentionConfig } from "@workspace/lib/mentions";
import { describe, expect, it } from "vitest";
import { cuedAnalyzer } from "../mention-judge/__fixtures__/cued-judge";
import { jevAnalyzer } from "../mention-judge/analyze";
import { type JevRequest, stubTransport } from "../mention-judge/jev";
import { deriveRunUpdate, type StaleRun } from "./derive-runs";

const config: MentionConfig = {
	brand: { name: "Acme", aliases: [], domains: ["https://acme.com"] },
	competitors: [],
};
const target = currentAnalysisVersions(config, cuedAnalyzer.judgeVersion);
/** A run whose extraction is current, so only its mentions are derived. */
const extractionCurrent = { [EXTRACTION_KEY]: target[EXTRACTION_KEY] };

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

/** A run as stored before text was: extracted, with no text and no stamp. */
const legacyRun = (text: string): StaleRun => ({
	id: "run-1",
	promptId: "prompt-1",
	question: "best crm",
	createdAt: new Date("2026-01-15T10:05:00.000Z"),
	model: "gpt-5",
	provider: "openai-api",
	extracted: true,
	textContent: null,
	rawOutput: openAiPayload(text),
	stamps: {},
	brandMentioned: false,
	competitorsMentioned: [],
	assessments: null,
	citationCount: 0,
});

describe("deriveRunUpdate", () => {
	it("extracts a newly recorded run's text and citations, then derives mentions from the text", async () => {
		const recorded = { ...legacyRun("Acme is great."), extracted: false };
		const update = await deriveRunUpdate(recorded, target, config, cuedAnalyzer);
		expect(update.extraction).toEqual({ textContent: "Acme is great.", stamp: target[EXTRACTION_KEY] });
		expect(update.mentions).toMatchObject({
			brandMentioned: true,
			competitorsMentioned: [],
			stamp: target[MENTIONS_KEY],
		});
		expect(update.citations).toEqual([
			{ url: "https://example.com/a", title: "A", domain: "example.com", citationIndex: 0 },
		]);
	});

	it("re-extracts a run extracted by older code only on a replay for a new extractor", async () => {
		const run = { ...legacyRun("Acme is great."), textContent: "Acme is great.", stamps: { [EXTRACTION_KEY]: "0" } };
		expect((await deriveRunUpdate(run, target, config, cuedAnalyzer)).extraction).toBeUndefined();
		const replayed = await deriveRunUpdate(run, target, config, cuedAnalyzer, true);
		expect(replayed.extraction?.stamp).toBe(target[EXTRACTION_KEY]);
		expect(replayed.citations).toHaveLength(1);
	});

	it("fills a run's missing text for mentions but leaves its citations and extraction stamp alone", async () => {
		const update = await deriveRunUpdate(legacyRun("Acme is great."), target, config, cuedAnalyzer);
		expect(update.extraction).toEqual({ textContent: "Acme is great.", stamp: null });
		expect(update.mentions?.brandMentioned).toBe(true);
		expect(update.citations).toBeUndefined();
	});

	it("derives mentions from stored text without re-extracting", async () => {
		const run = {
			...legacyRun("ignored"),
			textContent: "Acme is stored here.",
			rawOutput: null,
			stamps: extractionCurrent,
		};
		const update = await deriveRunUpdate(run, target, config, cuedAnalyzer);
		expect(update.extraction).toBeUndefined();
		expect(update.mentions).toMatchObject({
			brandMentioned: true,
			competitorsMentioned: [],
			stamp: target[MENTIONS_KEY],
		});
	});

	it("leaves a layer that is already current alone", async () => {
		const run = {
			...legacyRun("Acme"),
			textContent: "Acme",
			stamps: { [EXTRACTION_KEY]: target[EXTRACTION_KEY] },
		};
		const update = await deriveRunUpdate(run, target, config, cuedAnalyzer);
		expect(update.extraction).toBeUndefined();
		expect(update.citations).toBeUndefined();
		expect(update.mentions?.stamp).toBe(target[MENTIONS_KEY]);
	});
});

describe("deriveRunUpdate after a competitor is added", () => {
	const text = "Acme is great. Globex is fine.";
	const withGlobex = { ...config, competitors: [{ name: "Globex", aliases: [], domains: [] }] };

	it("asks the judge only about the new competitor, keeping what it knew about the brand", async () => {
		const judged = await deriveRunUpdate(
			{ ...legacyRun(text), textContent: text, stamps: extractionCurrent },
			target,
			config,
			cuedAnalyzer,
		);
		const run: StaleRun = {
			...legacyRun(text),
			textContent: text,
			stamps: { ...extractionCurrent, [MENTIONS_KEY]: target[MENTIONS_KEY] },
			assessments: judged.mentions?.assessments ?? null,
		};
		const requests: JevRequest[] = [];
		const analyzer = jevAnalyzer(async (request) => {
			requests.push(request);
			return stubTransport(request);
		});
		const update = await deriveRunUpdate(
			run,
			currentAnalysisVersions(withGlobex, analyzer.judgeVersion),
			withGlobex,
			analyzer,
		);
		expect(requests.map((request) => Object.keys(request.questions))).toEqual([["c0__verdict", "c0__evidence"]]);
		expect(update.mentions).toMatchObject({ brandMentioned: true, competitorsMentioned: ["Globex"] });
	});
});

describe("deriveRunUpdate on a payload that yields less than the run has", () => {
	// What older code stored when it trimmed the response before extracting from it.
	const emptied = { ...legacyRun("unused"), rawOutput: {} };

	it("keeps stored text and citations instead of replacing them with nothing", async () => {
		const run = { ...emptied, textContent: "Acme is great.", citationCount: 3 };
		const update = await deriveRunUpdate(run, target, config, cuedAnalyzer, true);
		expect(update.kept).toEqual(["text", "citations"]);
		expect(update.extraction).toEqual({ textContent: "Acme is great.", stamp: target[EXTRACTION_KEY] });
		expect(update.citations).toBeUndefined();
		expect(update.mentions?.brandMentioned).toBe(true);
	});

	it("keeps a legacy run's mentions when there is no text to derive them from", async () => {
		const run = { ...emptied, brandMentioned: true, competitorsMentioned: ["Globex"], stamps: extractionCurrent };
		const update = await deriveRunUpdate(run, target, config, cuedAnalyzer);
		expect(update.kept).toEqual(["mentions"]);
		expect(update.mentions).toMatchObject({
			brandMentioned: true,
			competitorsMentioned: ["Globex"],
			stamp: target[MENTIONS_KEY],
		});
	});

	it("still records an empty result for a run that never had anything", async () => {
		const update = await deriveRunUpdate({ ...emptied, extracted: false }, target, config, cuedAnalyzer);
		expect(update.kept).toEqual([]);
		expect(update.citations).toEqual([]);
		expect(update.mentions?.brandMentioned).toBe(false);
	});
});
