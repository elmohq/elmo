/**
 * Judged over a window rather than per run: an engine may decline to search on
 * any single prompt, and providers write the same `unavailable` sentinel for
 * that as they do when extraction breaks.
 */
import type { TargetExpectation } from "@workspace/config/scrape-targets";

/** Below this, silence isn't yet evidence of anything. */
export const AUDIT_MIN_RUNS = 8;

export interface ProviderRunRecord {
	status: "pass" | "fail";
	citations: number;
	genuineWebQueries: number;
	queriesInRawOutput: boolean;
}

export type ViolationKind =
	| "unextracted-queries"
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
	expectationVerified: boolean;
}

export interface AuditInput {
	target: string;
	expectation: TargetExpectation;
	records: ProviderRunRecord[];
}

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
 * Absence needs a sample to mean anything; presence needs one run, since data
 * can't appear from a provider that has none.
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

	// Neither state makes a claim a window can falsify.
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

/** Follow-ups an engine suggests below its answer, not searches it ran. */
const NOT_SEARCHES = new Set(["related_queries", "relatedqueries", "suggested_queries", "suggestedqueries"]);

export interface QueryField {
	path: string;
	values: string[];
}

function isQueryKey(key: string): boolean {
	return /quer/i.test(key) && !NOT_SEARCHES.has(key.toLowerCase());
}

function asQueryValues(value: unknown): string[] {
	if (typeof value === "string") return value.trim() ? [value] : [];
	if (Array.isArray(value)) {
		return value
			.map((item) => (typeof item === "string" ? item : (item as any)?.query))
			.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	}
	return [];
}

/** What a provider *could* give us, independent of what our extractor took. */
export function findQueryFields(payload: unknown, path = "$"): QueryField[] {
	if (payload === null || typeof payload !== "object") return [];
	if (Array.isArray(payload)) return payload.flatMap((item, i) => findQueryFields(item, `${path}[${i}]`));

	const found: QueryField[] = [];
	for (const [key, value] of Object.entries(payload)) {
		const here = `${path}.${key}`;
		const values = isQueryKey(key) ? asQueryValues(value) : [];
		if (values.length > 0) {
			// Descending would report the same strings again under a deeper path.
			found.push({ path: here, values });
			continue;
		}
		found.push(...findQueryFields(value, here));
	}
	return found;
}

/** Values matching the prompt are ignored — an echoed keyword isn't a search. */
export function auditPayload(target: string, payload: unknown, reportedQueries: number, prompt?: string): Violation[] {
	if (reportedQueries > 0) return [];
	const fields = findQueryFields(payload).filter((f) =>
		f.values.some((v) => !prompt || v.trim().toLowerCase() !== prompt.trim().toLowerCase()),
	);
	if (fields.length === 0) return [];

	const shown = fields.slice(0, 3).map((f) => `${f.path} = ${JSON.stringify(f.values.slice(0, 2))}`);
	return [
		{
			target,
			kind: "unextracted-queries",
			message: `payload carries searches the run did not report: ${shown.join("; ")}`,
			expectationVerified: true,
		},
	];
}

export function auditTargets(inputs: AuditInput[]): Violation[] {
	return inputs.flatMap(auditTarget);
}
