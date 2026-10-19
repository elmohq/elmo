import { currentAnalysisVersions, EXTRACTION_KEY } from "@workspace/lib/analysis-versions";
import type { MentionConfig } from "@workspace/lib/mentions";
import { describe, expect, it } from "vitest";
import { cuedAnalyzer } from "../mention-judge/__fixtures__/cued-judge";
import { reprocessDays } from "./derive-runs";
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

describe("reprocessDays", () => {
	it("defaults to 90 days, takes a whole number of days, or all", () => {
		expect(reprocessDays({})).toBe(90);
		expect(reprocessDays({ REPROCESS_DAYS: "30" })).toBe(30);
		expect(reprocessDays({ REPROCESS_DAYS: "all" })).toBeNull();
	});

	it("rejects anything else rather than guessing", () => {
		for (const value of ["0", "-5", "1.5", "1e2", "999999", "forever"]) {
			expect(() => reprocessDays({ REPROCESS_DAYS: value })).toThrow("REPROCESS_DAYS");
		}
	});
});
