import { STATUS_TARGET_EXPECTATIONS, type TargetExpectation } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { AUDIT_MIN_RUNS, auditTarget, type ProviderRunRecord } from "./provider-audit";

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

	// The sentinel is what a broken extractor leaves behind, and it is not a
	// genuine query — the whole point of recording the two separately.
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

	// The direction that catches us falling behind a vendor rather than breaking:
	// one run is proof, because data cannot appear from a provider that has none.
	it("fails when a target declared silent starts reporting queries", () => {
		const records = [...runs(1), ...runs(20, { genuineWebQueries: 0 })];
		expect(kinds("t", expects({ webQueries: "no" }), records)).toEqual(["unexpected-web-queries"]);
	});

	it("fails when a target searches despite being configured not to", () => {
		const offline = expects({ webQueries: "no", citations: "no" });
		expect(kinds("t", offline, [run({ citations: 5, genuineWebQueries: 0 })])).toEqual(["unexpected-citations"]);
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
	// The two failures that prompted this audit, pinned as regression cases.
	it("requires fan-out from OpenAI with web search and forbids it without", () => {
		expect(STATUS_TARGET_EXPECTATIONS["chatgpt:openai-api:gpt-5-mini:online"].webQueries).toBe("yes");
		expect(STATUS_TARGET_EXPECTATIONS["chatgpt:openai-api:gpt-5-mini"].webQueries).toBe("no");
	});

	it("requires fan-out from OpenRouter's native search", () => {
		expect(STATUS_TARGET_EXPECTATIONS["perplexity:openrouter:perplexity/sonar:online"].webQueries).toBe("yes");
	});
});
