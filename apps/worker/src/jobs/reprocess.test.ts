import { currentAnalysisVersions, EXTRACTION_KEY } from "@workspace/lib/analysis-versions";
import type { MentionConfig } from "@workspace/lib/mentions";
import { describe, expect, it } from "vitest";
import { cuedAnalyzer } from "../mention-judge/__fixtures__/cued-judge";
import { staleLayers } from "./reprocess";

const config: MentionConfig = {
	brand: { name: "Acme", aliases: [], domains: ["https://acme.com"] },
	competitors: [],
};
const target = currentAnalysisVersions(config, cuedAnalyzer.judgeVersion);

describe("staleLayers", () => {
	it("asks for nothing when history matches today's code and config", () => {
		expect(staleLayers(target, target)).toEqual([]);
	});

	it("re-derives mentions alone after a config change", () => {
		const moved = currentAnalysisVersions(
			{ ...config, brand: { ...config.brand, aliases: ["Acme Corp"] } },
			cuedAnalyzer.judgeVersion,
		);
		expect(staleLayers(target, moved)).toEqual(["interpretation"]);
	});

	it("brings interpretation along with extraction, since new text changes what is found", () => {
		expect(staleLayers({ ...target, [EXTRACTION_KEY]: "0" }, target)).toEqual(["extraction", "interpretation"]);
	});
});
