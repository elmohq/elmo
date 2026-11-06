import {
	ALL_MODELS_VALUE,
	labelForModelFilter,
	parseModelFilter,
	targetFilterValue,
} from "@workspace/config/model-filter";
import { PLATFORM_TIER_LABELS } from "@workspace/config/plans";
import { describe, expect, it } from "vitest";
import {
	describeTargetSchedule,
	getAvailableModels,
	groupTrackedTargets,
	type TrackedTarget,
} from "@/lib/model-filter";

const target = (
	model: string,
	premium = false,
	overrides: Partial<Pick<TrackedTarget, "tier" | "intervalHours" | "replication">> = {},
): TrackedTarget => ({
	value: targetFilterValue(model, premium),
	model,
	premium,
	tier: premium ? "premium" : "scraped",
	intervalHours: premium ? 24 : 6,
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
		[48, "ChatGPT — every 2 days"],
		[168, "ChatGPT — every 7 days"],
	])("describes an interval of %i hours as %s", (intervalHours, expected) => {
		expect(describeTargetSchedule(target("chatgpt", false, { intervalHours }))).toBe(expected);
	});

	it.each([0, -1])("claims no cadence for an interval of %i hours", (intervalHours) => {
		expect(describeTargetSchedule(target("chatgpt", false, { intervalHours }))).not.toMatch(/\d/);
	});

	it("appends the replication count when it is more than 1", () => {
		expect(describeTargetSchedule(target("claude", false, { intervalHours: 12, replication: 3 }))).toBe(
			"Claude — 2×/day ×3",
		);
	});

	it("omits the replication count for a single call per run", () => {
		expect(describeTargetSchedule(target("claude", false, { intervalHours: 12, replication: 1 }))).toBe(
			"Claude — 2×/day",
		);
	});

	it("labels a grounded target the way it is sold, not as a second model", () => {
		expect(describeTargetSchedule(target("chatgpt", true, { intervalHours: 24 }))).toBe("GPT Search — 1×/day");
	});

	it("title-cases a model id Elmo doesn't know", () => {
		expect(describeTargetSchedule(target("my-custom-model", false, { intervalHours: 24, replication: 2 }))).toBe(
			"My Custom Model — 1×/day ×2",
		);
	});
});

describe("groupTrackedTargets", () => {
	it("keeps tier order regardless of input order", () => {
		expect(
			groupTrackedTargets([
				target("claude", false, { tier: "api" }),
				target("chatgpt", true),
				target("perplexity"),
				target("chatgpt"),
			]),
		).toEqual([
			{ tier: "scraped", label: PLATFORM_TIER_LABELS.scraped, values: ["perplexity", "chatgpt"] },
			{ tier: "api", label: PLATFORM_TIER_LABELS.api, values: ["claude"] },
			{ tier: "premium", label: PLATFORM_TIER_LABELS.premium, values: [targetFilterValue("chatgpt", true)] },
		]);
	});

	it("leaves out tiers with no targets", () => {
		expect(groupTrackedTargets([target("claude", false, { tier: "api" })])).toEqual([
			{ tier: "api", label: PLATFORM_TIER_LABELS.api, values: ["claude"] },
		]);
	});

	it("returns an empty list for an empty input", () => {
		expect(groupTrackedTargets([])).toEqual([]);
	});
});
