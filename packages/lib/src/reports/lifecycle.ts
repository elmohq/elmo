/**
 * A report's lifecycle, as data.
 *
 * `report_status` has always been an enum, but the part that matters while a
 * report runs — which of its five phases it is in — existed only as percentages
 * written by hand at the points they happened to be reached. That made the
 * number the state: nothing could ask a stuck report what it had been doing,
 * and a phase inserted in the middle meant re-picking every percentage after it.
 *
 * Phase is the state here and progress is derived from it, so the two cannot
 * disagree and the ranges stay where the reader can see them all at once.
 */

export type ReportStatus = "pending" | "processing" | "completed" | "failed";

export type ReportPhase =
	/** Queued, not yet picked up by a worker. */
	| { kind: "queued" }
	/** One LLM call for the brand's competitors and its candidate prompts. */
	| { kind: "analyzing-brand" }
	/** The expensive part: every candidate prompt against every scrape target. */
	| { kind: "testing-candidates"; completed: number; total: number }
	/** Scoring the candidates down to the prompts the report will show. */
	| { kind: "selecting" }
	/** Assembling the selected prompts' already-paid-for runs. */
	| { kind: "assembling"; completed: number; total: number }
	/** Writing the finished report. */
	| { kind: "finalizing" }
	| { kind: "completed" };

/**
 * Where each phase sits on the 0–100 the UI shows. Contiguous by construction:
 * a phase ends where the next one begins, so progress never goes backwards.
 */
const PHASE_RANGE: Record<ReportPhase["kind"], [number, number]> = {
	queued: [0, 0],
	"analyzing-brand": [5, 35],
	"testing-candidates": [40, 70],
	selecting: [70, 75],
	assembling: [75, 95],
	finalizing: [95, 95],
	completed: [100, 100],
};

/** Whole percent, so the stored column and the rendered bar agree. */
export function reportProgress(phase: ReportPhase): number {
	const [start, end] = PHASE_RANGE[phase.kind];
	if (phase.kind !== "testing-candidates" && phase.kind !== "assembling") return start;
	// A phase with nothing to do is finished, not divided by zero.
	const fraction = phase.total > 0 ? Math.min(phase.completed / phase.total, 1) : 1;
	return Math.round(start + (end - start) * fraction);
}

/** What the user is told a running report is doing. */
export function describeReportPhase(phase: ReportPhase): string {
	switch (phase.kind) {
		case "queued":
			return "Waiting for a worker";
		case "analyzing-brand":
			return "Researching the brand";
		case "testing-candidates":
			return `Testing prompts (${phase.completed} of ${phase.total})`;
		case "selecting":
			return "Selecting the best prompts";
		case "assembling":
			return "Assembling results";
		case "finalizing":
			return "Finalizing";
		case "completed":
			return "Done";
	}
}

const TERMINAL: ReadonlySet<ReportStatus> = new Set<ReportStatus>(["completed", "failed"]);

export function isTerminalReportStatus(status: ReportStatus): boolean {
	return TERMINAL.has(status);
}

/**
 * Whether a worker holding `from` may write `to`.
 *
 * A terminal report is finished for good. The queue retries a failed job, and
 * without this a retry would take a report from `failed` back to `processing`
 * and pay for the entire candidate fan-out a second time — or overwrite a
 * report that had already completed. Retries are off for this queue precisely
 * so that cannot happen; this is the check that holds if they are ever turned
 * back on, or if two workers somehow hold the same report.
 */
export function canAdvanceReport(from: ReportStatus, to: ReportStatus): boolean {
	if (isTerminalReportStatus(from)) return false;
	if (from === to) return false;
	if (to === "pending") return false;
	return true;
}

/**
 * How long a report may sit in a non-terminal status without its worker saying
 * anything before it is treated as abandoned.
 *
 * A report's own work is bounded by the job's expiry; this is about the worker
 * disappearing — SIGKILL, a lost node — which leaves the row `processing` with
 * no job behind it and nothing to ever move it again. Generously past the
 * slowest healthy report so a slow one is never mistaken for a dead one.
 */
export const REPORT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export interface StaleReportCandidate {
	id: string;
	status: ReportStatus;
	updatedAt: Date;
}

/**
 * Reports whose worker is gone. Read by the maintenance sweep, which fails them
 * so the page stops claiming they are still running.
 */
export function abandonedReports(
	candidates: StaleReportCandidate[],
	now: Date,
	staleAfterMs: number = REPORT_STALE_AFTER_MS,
): string[] {
	return candidates
		.filter(
			(report) => !isTerminalReportStatus(report.status) && now.getTime() - report.updatedAt.getTime() >= staleAfterMs,
		)
		.map((report) => report.id);
}
