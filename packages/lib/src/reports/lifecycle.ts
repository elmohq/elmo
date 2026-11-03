export type ReportStatus = "pending" | "processing" | "completed" | "failed";

export type ReportPhase =
	| { kind: "queued" }
	| { kind: "analyzing-brand" }
	| { kind: "testing-candidates"; completed: number; total: number }
	| { kind: "selecting" }
	| { kind: "assembling"; completed: number; total: number }
	| { kind: "finalizing" }
	| { kind: "completed" };

const PHASE_RANGE: Record<ReportPhase["kind"], [number, number]> = {
	queued: [0, 0],
	"analyzing-brand": [5, 35],
	"testing-candidates": [40, 70],
	selecting: [70, 75],
	assembling: [75, 95],
	finalizing: [95, 95],
	completed: [100, 100],
};

export function reportProgress(phase: ReportPhase): number {
	const [start, end] = PHASE_RANGE[phase.kind];
	if (phase.kind !== "testing-candidates" && phase.kind !== "assembling") return start;
	const fraction = phase.total > 0 ? Math.min(phase.completed / phase.total, 1) : 1;
	return Math.round(start + (end - start) * fraction);
}

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

export function canAdvanceReport(from: ReportStatus, to: ReportStatus): boolean {
	if (isTerminalReportStatus(from)) return false;
	if (from === to) return false;
	if (to === "pending") return false;
	return true;
}

// Generously past the slowest healthy report so a slow one is never mistaken for a dead one.
export const REPORT_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export interface StaleReportCandidate {
	id: string;
	status: ReportStatus;
	updatedAt: Date;
}

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
