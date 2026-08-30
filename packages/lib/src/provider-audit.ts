/**
 * Audits recorded provider-test history against what each target is declared to
 * return, without calling any provider.
 *
 * The per-run checks in `test-provider.ts` can only ask whether our extractor
 * produced something, so a broken extractor and a provider that exposes nothing
 * are the same observation and the charitable reading wins every time. This
 * compares recorded reality against `STATUS_TARGET_EXPECTATIONS`, which is
 * written independently of the extractors — so the two can disagree, and a
 * disagreement is the signal.
 *
 * Judged over a window rather than per run: an engine may decline to search on
 * any single prompt, and providers write the same `unavailable` sentinel for
 * that as they do when extraction breaks.
 */
import type { TargetExpectation } from "@workspace/config/scrape-targets";

/**
 * A target reporting nothing is only evidence once there are enough runs for
 * silence to be surprising. Below this, absence is reported as unproven rather
 * than as a defect.
 */
export const AUDIT_MIN_RUNS = 8;

/** One recorded provider test, as pushed by the scheduled workflow. */
export interface ProviderRunRecord {
	status: "pass" | "fail";
	citations: number;
	/** Reported queries with the `unavailable` sentinel excluded. */
	genuineWebQueries: number;
	/** Whether the stored payload contained every query the run reported. */
	queriesInRawOutput: boolean;
}

export type ViolationKind =
	| "no-runs"
	| "all-failing"
	| "missing-web-queries"
	| "unexpected-web-queries"
	| "missing-citations"
	| "unexpected-citations"
	| "queries-not-in-raw-output";

export interface Violation {
	target: string;
	kind: ViolationKind;
	message: string;
	/** False when the expectation itself is the likelier thing to be wrong. */
	expectationVerified: boolean;
}

export interface AuditInput {
	target: string;
	expectation: TargetExpectation;
	records: ProviderRunRecord[];
}

/**
 * Fails when reported queries are missing from the payload that was stored.
 * This is the invariant that makes a row replayable, and it holds for every
 * target regardless of what the expectation says.
 */
function auditReplayability(input: AuditInput, passing: ProviderRunRecord[]): Violation[] {
	const broken = passing.filter((r) => !r.queriesInRawOutput).length;
	if (broken === 0) return [];
	return [
		{
			target: input.target,
			kind: "queries-not-in-raw-output",
			message: `${broken}/${passing.length} runs reported queries the stored payload does not contain — those rows cannot be re-extracted`,
			expectationVerified: true,
		},
	];
}

/**
 * Both directions of a "yes"/"no" expectation. Absence needs a sample to mean
 * anything; presence needs only one run, since a target declared silent that
 * produced real data has been overtaken by its vendor.
 */
function auditField(
	input: AuditInput,
	passing: ProviderRunRecord[],
	field: "webQueries" | "citations",
	count: (record: ProviderRunRecord) => number,
	kinds: { missing: ViolationKind; unexpected: ViolationKind },
): Violation[] {
	const withData = passing.filter((r) => count(r) > 0).length;
	const declared = input.expectation[field];
	const expectationVerified = input.expectation.verified;

	// Neither state makes a claim a window can falsify: "intermittent" is too
	// rare to expect in any given window, and "unknown" is the absence of a
	// claim. Both stay silent rather than reporting a finding nobody can act on.
	if (declared === "intermittent" || declared === "unknown") return [];

	if (declared === "yes" && withData === 0 && passing.length >= AUDIT_MIN_RUNS) {
		return [
			{
				target: input.target,
				kind: kinds.missing,
				message: `expected ${field} but none appeared across ${passing.length} passing runs`,
				expectationVerified,
			},
		];
	}
	if (declared === "no" && withData > 0) {
		return [
			{
				target: input.target,
				kind: kinds.unexpected,
				message: `expected no ${field}, but ${withData}/${passing.length} runs reported some — the provider exposes data we are not declaring`,
				expectationVerified,
			},
		];
	}
	return [];
}

/** Every way a target's recorded history diverges from what it should return. */
export function auditTarget(input: AuditInput): Violation[] {
	if (input.records.length === 0) {
		return [
			{
				target: input.target,
				kind: "no-runs",
				message: "no runs recorded in the window — the target stopped being tested",
				expectationVerified: true,
			},
		];
	}

	const passing = input.records.filter((r) => r.status === "pass");
	if (passing.length === 0) {
		return [
			{
				target: input.target,
				kind: "all-failing",
				message: `all ${input.records.length} runs failed`,
				expectationVerified: true,
			},
		];
	}

	return [
		...auditReplayability(input, passing),
		...auditField(input, passing, "webQueries", (r) => r.genuineWebQueries, {
			missing: "missing-web-queries",
			unexpected: "unexpected-web-queries",
		}),
		...auditField(input, passing, "citations", (r) => r.citations, {
			missing: "missing-citations",
			unexpected: "unexpected-citations",
		}),
	];
}

export function auditTargets(inputs: AuditInput[]): Violation[] {
	return inputs.flatMap(auditTarget);
}
