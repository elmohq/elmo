import { STATUS_TARGET_EXPECTATIONS, type TargetExpectation } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { AUDIT_MIN_RUNS, auditPayload, auditTarget, findQueryFields, type ProviderRunRecord } from "./provider-audit";

const run = (over: Partial<ProviderRunRecord> = {}): ProviderRunRecord => ({
	status: "pass",
	citations: 3,
	genuineWebQueries: 2,
	queriesInRawOutput: true,
	...over,
});

const runs = (count: number, over: Partial<ProviderRunRecord> = {}) => Array.from({ length: count }, () => run(over));

const expects = (over: Partial<TargetExpectation> = {}): TargetExpectation => ({
	webQueries: "yes",
	citations: "yes",
	verified: true,
	...over,
});

const kinds = (target: string, expectation: TargetExpectation, records: ProviderRunRecord[]) =>
	auditTarget({ target, expectation, records }).map((v) => v.kind);

describe("auditTarget", () => {
	it("passes a target returning everything it should", () => {
		expect(kinds("t", expects(), runs(AUDIT_MIN_RUNS))).toEqual([]);
	});

	it("fails a target that should report queries but reported none", () => {
		expect(kinds("t", expects(), runs(AUDIT_MIN_RUNS, { genuineWebQueries: 0 }))).toEqual(["missing-web-queries"]);
	});

	it("counts the unavailable sentinel as no queries at all", () => {
		const sentinelOnly = runs(AUDIT_MIN_RUNS, { genuineWebQueries: 0 });
		expect(kinds("t", expects(), sentinelOnly)).toContain("missing-web-queries");
	});

	it("stays quiet on a thin sample rather than guessing", () => {
		expect(kinds("t", expects(), runs(AUDIT_MIN_RUNS - 1, { genuineWebQueries: 0 }))).toEqual([]);
	});

	it("passes when queries appear on only some runs, as engines vary", () => {
		const records = [...runs(1), ...runs(AUDIT_MIN_RUNS - 1, { genuineWebQueries: 0 })];
		expect(kinds("t", expects(), records)).toEqual([]);
	});

	// One run is proof: data can't appear from a provider that has none.
	it("fails when a target declared silent starts reporting queries", () => {
		const records = [...runs(1), ...runs(20, { genuineWebQueries: 0 })];
		expect(kinds("t", expects({ webQueries: "no" }), records)).toEqual(["unexpected-web-queries"]);
	});

	it("fails when a target searches despite being configured not to", () => {
		const offline = expects({ webQueries: "no", citations: "no" });
		expect(kinds("t", offline, [run({ citations: 5, genuineWebQueries: 0 })])).toEqual(["unexpected-citations"]);
	});

	it("makes no claim about an intermittent target", () => {
		expect(kinds("t", expects({ webQueries: "intermittent" }), runs(20, { genuineWebQueries: 0 }))).toEqual([]);
		expect(kinds("t", expects({ webQueries: "intermittent" }), runs(20))).toEqual([]);
	});

	// "unknown" is the absence of a claim, so neither direction can be asserted.
	it("makes no claim in either direction about an unknown target", () => {
		expect(kinds("t", expects({ webQueries: "unknown" }), runs(20, { genuineWebQueries: 0 }))).toEqual([]);
		expect(kinds("t", expects({ webQueries: "unknown" }), runs(20))).toEqual([]);
	});

	it("still requires unknown targets to store what they report", () => {
		const records = runs(20, { queriesInRawOutput: false });
		expect(kinds("t", expects({ webQueries: "unknown" }), records)).toEqual(["queries-not-in-raw-output"]);
	});

	it("fails when reported queries are missing from the stored payload", () => {
		const records = runs(AUDIT_MIN_RUNS, { queriesInRawOutput: false });
		expect(kinds("t", expects(), records)).toEqual(["queries-not-in-raw-output"]);
	});

	it("fails a target that stopped being tested", () => {
		expect(kinds("t", expects(), [])).toEqual(["no-runs"]);
	});

	it("reports a wholly failing target once rather than as every missing field", () => {
		expect(kinds("t", expects(), runs(4, { status: "fail" }))).toEqual(["all-failing"]);
	});

	it("ignores failed runs when judging what a target reports", () => {
		const records = [...runs(AUDIT_MIN_RUNS), ...runs(5, { status: "fail", citations: 0, genuineWebQueries: 0 })];
		expect(kinds("t", expects(), records)).toEqual([]);
	});

	it("marks whether the expectation or the code is the likelier culprit", () => {
		const guessed = auditTarget({
			target: "t",
			expectation: expects({ verified: false }),
			records: runs(AUDIT_MIN_RUNS, { genuineWebQueries: 0 }),
		});
		expect(guessed[0].expectationVerified).toBe(false);
	});
});

describe("the declared expectations", () => {
	it("requires fan-out from OpenAI with web search and forbids it without", () => {
		expect(STATUS_TARGET_EXPECTATIONS["chatgpt:openai-api:gpt-5-mini:online"].webQueries).toBe("yes");
		expect(STATUS_TARGET_EXPECTATIONS["chatgpt:openai-api:gpt-5-mini"].webQueries).toBe("no");
	});

	it("requires fan-out from OpenRouter's native search", () => {
		expect(STATUS_TARGET_EXPECTATIONS["perplexity:openrouter:perplexity/sonar:online"].webQueries).toBe("yes");
	});
});

describe("findQueryFields", () => {
	it("finds the searches OpenAI reports on its web_search_call items", () => {
		const payload = {
			output: [
				{ type: "web_search_call", action: { type: "search", queries: ["best crm 2026", "crm pricing"] } },
				{ type: "message", content: [{ type: "output_text", text: "answer" }] },
			],
		};

		expect(findQueryFields(payload)).toEqual([
			{ path: "$.output[0].action.queries", values: ["best crm 2026", "crm pricing"] },
		]);
	});

	it.each([
		["fan_out_queries", { tasks: [{ result: [{ fan_out_queries: ["a", "b"] }] }] }],
		["search_queries", { search_queries: ["a", "b"] }],
		["search_model_queries", { search_model_queries: [{ query: "a" }, { query: "b" }] }],
		["searchQueries", { searchQueries: ["a", "b"] }],
	])("finds %s wherever a provider nests it", (_label, payload) => {
		expect(findQueryFields(payload).flatMap((f) => f.values)).toEqual(["a", "b"]);
	});

	it("ignores suggested follow-ups, which are not searches", () => {
		expect(findQueryFields({ related_queries: ["what about X", "and Y"] })).toEqual([]);
	});

	it("ignores empty and blank values", () => {
		expect(findQueryFields({ search_queries: ["", "   "], query: "" })).toEqual([]);
	});
});

describe("auditPayload", () => {
	it("flags a payload carrying searches the run never reported", () => {
		const violations = auditPayload("t", { search_queries: ["a search"] }, 0);

		expect(violations.map((v) => v.kind)).toEqual(["unextracted-queries"]);
		expect(violations[0].message).toContain("a search");
	});

	it("stays quiet when the run already reported queries", () => {
		expect(auditPayload("t", { search_queries: ["a search"] }, 2)).toEqual([]);
	});

	it("stays quiet for a payload that genuinely carries no searches", () => {
		expect(auditPayload("t", { items: [{ type: "ai_overview", text: "answer" }] }, 0)).toEqual([]);
	});

	it("ignores a query field that is just the prompt echoed back", () => {
		expect(auditPayload("t", { keyword: "best crm", query: "best crm" }, 0, "best crm")).toEqual([]);
	});
});
