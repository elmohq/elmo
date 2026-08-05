import { describe, expect, it } from "vitest";
import {
	getProviderCostEstimate,
	parseProviderCostEstimates,
	validateProviderCostEstimateCoverage,
} from "./provider-costs";

const targets = [
	{ targetKey: "chatgpt-standard", model: "chatgpt", provider: "olostep", webSearch: true },
	{ targetKey: "claude-native-web", model: "claude", provider: "anthropic-api", webSearch: true },
] as const;

describe("cloud provider cost estimates", () => {
	it("parses nonnegative safe-integer microusd estimates", () => {
		const estimates = parseProviderCostEstimates(
			JSON.stringify({ "chatgpt-standard": 12_500, "claude-native-web": 23_000 }),
		);
		expect(estimates).toEqual({ "chatgpt-standard": 12_500, "claude-native-web": 23_000 });
		expect(getProviderCostEstimate(estimates, "claude-native-web")).toBe(23_000);
	});

	it.each([
		undefined,
		"not-json",
		"[]",
		JSON.stringify({ bad_key: 1 }),
		JSON.stringify({ "chatgpt-standard": -1 }),
		JSON.stringify({ "chatgpt-standard": 1.5 }),
	])("rejects malformed operator input %#", (value) => {
		expect(() => parseProviderCostEstimates(value)).toThrow();
	});

	it("requires exact target coverage so no call starts without a cost", () => {
		const complete = parseProviderCostEstimates(
			JSON.stringify({ "chatgpt-standard": 12_500, "claude-native-web": 23_000 }),
		);
		expect(() => validateProviderCostEstimateCoverage(complete, targets)).not.toThrow();

		expect(() =>
			validateProviderCostEstimateCoverage(parseProviderCostEstimates('{"chatgpt-standard":12500}'), targets),
		).toThrow("missing estimates for claude-native-web");
		expect(() =>
			validateProviderCostEstimateCoverage(
				parseProviderCostEstimates('{"chatgpt-standard":12500,"claude-native-web":23000,"retired-target":1}'),
				targets,
			),
		).toThrow("unknown estimates for retired-target");
	});

	it("rejects duplicate stable target keys before boot", () => {
		const duplicateTargets = [targets[0], { ...targets[0], provider: "brightdata" }];
		const estimates = parseProviderCostEstimates('{"chatgpt-standard":12500}');
		expect(() => validateProviderCostEstimateCoverage(estimates, duplicateTargets)).toThrow(
			"duplicate target keys: chatgpt-standard",
		);
	});

	it("does not accept inherited Object prototype keys as cost coverage", () => {
		const prototypeNamedTarget = [{ targetKey: "constructor", model: "chatgpt", provider: "olostep", webSearch: true }];
		const estimates = parseProviderCostEstimates("{}");
		expect(() => validateProviderCostEstimateCoverage(estimates, prototypeNamedTarget)).toThrow(
			"missing estimates for constructor",
		);
		expect(() => getProviderCostEstimate(estimates, "constructor")).toThrow("No cloud provider cost estimate");
	});
});
