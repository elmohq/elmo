import {
	ALL_MODELS_VALUE,
	labelForModelFilter,
	parseModelFilter,
	targetFilterValue,
} from "@workspace/config/model-filter";
import { describe, expect, it } from "vitest";
import {
	describeTargetSchedule,
	getAvailableModels,
	groupTrackedTargets,
	type TrackedTarget,
} from "@/lib/model-filter";

const target = (model: string, premium = false): TrackedTarget => ({
	value: targetFilterValue(model, premium),
	model,
	premium,
	tier: premium ? "premium" : "scraped",
	intervalHours: premium ? 24 : 6,
	replication: 1,
});

const scheduled = (overrides: Partial<TrackedTarget> = {}): TrackedTarget => ({
	value: "chatgpt",
	model: "chatgpt",
	premium: false,
	tier: "scraped",
	intervalHours: 6,
	replication: 1,
	...overrides,
});

describe("getAvailableModels", () => {
	it("returns an empty list for an empty input", () => {
		expect(getAvailableModels([])).toEqual([]);
	});

	it("returns just the target when only one is tracked (no 'all' sentinel)", () => {
		expect(getAvailableModels([target("chatgpt")])).toEqual(["chatgpt"]);
	});

	it("prepends 'all' when several are tracked", () => {
		expect(getAvailableModels([target("chatgpt"), target("claude")])).toEqual([ALL_MODELS_VALUE, "chatgpt", "claude"]);
	});

	it("preserves the caller's ordering", () => {
		expect(getAvailableModels([target("perplexity"), target("gemini")])).toEqual([
			ALL_MODELS_VALUE,
			"perplexity",
			"gemini",
		]);
	});

	it("works for arbitrary deployment-configured model ids, not just the ones Elmo knows about", () => {
		expect(getAvailableModels([target("my-custom-model"), target("another-model")])).toEqual([
			ALL_MODELS_VALUE,
			"my-custom-model",
			"another-model",
		]);
	});

	it("keeps a model's scraped and grounded variants apart", () => {
		// The bug this encoding exists for: both are `chatgpt` with web search on,
		// so a filter keyed on the model id alone listed ChatGPT twice.
		expect(getAvailableModels([target("chatgpt"), target("chatgpt", true)])).toEqual([
			ALL_MODELS_VALUE,
			"chatgpt",
			"chatgpt::premium",
		]);
	});
});

describe("parseModelFilter", () => {
	it("treats the sentinel and the empty string as no filter", () => {
		expect(parseModelFilter(ALL_MODELS_VALUE)).toBeNull();
		expect(parseModelFilter("")).toBeNull();
	});

	it("round-trips both variants", () => {
		expect(parseModelFilter(targetFilterValue("chatgpt", false))).toEqual({ model: "chatgpt", premium: false });
		expect(parseModelFilter(targetFilterValue("chatgpt", true))).toEqual({ model: "chatgpt", premium: true });
	});
});

describe("labelForModelFilter", () => {
	it("names the grounded variant the way it is sold, not as a second ChatGPT", () => {
		expect(labelForModelFilter("chatgpt")).toBe("ChatGPT");
		expect(labelForModelFilter("chatgpt::premium")).toBe("GPT Search");
		expect(labelForModelFilter("grok::premium")).toBe("Grok (web)");
	});

	it("labels the no-filter sentinel", () => {
		expect(labelForModelFilter(ALL_MODELS_VALUE)).toBe("All models");
	});
});

describe("describeTargetSchedule", () => {
	it.each([
		[1, "ChatGPT — 24×/day"],
		[6, "ChatGPT — 4×/day"],
		[12, "ChatGPT — 2×/day"],
		[16, "ChatGPT — 1.5×/day"],
		[24, "ChatGPT — 1×/day"],
		[5, "ChatGPT — 4.8×/day"],
		[7, "ChatGPT — 3.4×/day"],
		[25, "ChatGPT — every other day"],
		[36, "ChatGPT — every other day"],
		[48, "ChatGPT — every 2 days"],
		[60, "ChatGPT — every 3 days"],
		[168, "ChatGPT — every 7 days"],
		[0, "ChatGPT — —"],
		[-1, "ChatGPT — —"],
	])("describes an interval of %i hours as %s", (intervalHours, expected) => {
		expect(describeTargetSchedule(scheduled({ intervalHours }))).toBe(expected);
	});

	it("appends the replication count when it is more than 1", () => {
		expect(describeTargetSchedule(scheduled({ value: "claude", intervalHours: 12, replication: 3 }))).toBe(
			"Claude — 2×/day ×3",
		);
	});

	it("omits the replication count when it is 1 or less", () => {
		expect(describeTargetSchedule(scheduled({ value: "claude", intervalHours: 12, replication: 0 }))).toBe(
			"Claude — 2×/day",
		);
	});

	it("labels a grounded target the way it is sold, not as a second model", () => {
		expect(
			describeTargetSchedule(
				scheduled({ value: "chatgpt::premium", premium: true, tier: "premium", intervalHours: 24 }),
			),
		).toBe("GPT Search — 1×/day");
	});

	it("title-cases a model id Elmo doesn't know", () => {
		expect(describeTargetSchedule(scheduled({ value: "my-custom-model", intervalHours: 24, replication: 2 }))).toBe(
			"My Custom Model — 1×/day ×2",
		);
	});
});

describe("groupTrackedTargets", () => {
	it("keeps tier order regardless of input order", () => {
		expect(
			groupTrackedTargets([
				scheduled({ value: "claude", tier: "api" }),
				scheduled({ value: "chatgpt::premium", premium: true, tier: "premium" }),
				scheduled({ value: "perplexity", tier: "scraped" }),
				scheduled({ value: "chatgpt", tier: "scraped" }),
			]),
		).toEqual([
			{ tier: "scraped", label: "Scraped Engines", values: ["perplexity", "chatgpt"] },
			{ tier: "api", label: "LLM APIs", values: ["claude"] },
			{ tier: "premium", label: "Premium LLM APIs", values: ["chatgpt::premium"] },
		]);
	});

	it("leaves out tiers with no targets", () => {
		expect(groupTrackedTargets([scheduled({ value: "claude", tier: "api" })])).toEqual([
			{ tier: "api", label: "LLM APIs", values: ["claude"] },
		]);
	});

	it("returns an empty list for an empty input", () => {
		expect(groupTrackedTargets([])).toEqual([]);
	});
});
