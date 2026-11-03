import { describe, expect, it } from "vitest";
import { abandonedReports, canAdvanceReport, type ReportPhase, type ReportStatus, reportProgress } from "./lifecycle";

const PHASES: ReportPhase[] = [
	{ kind: "queued" },
	{ kind: "analyzing-brand" },
	{ kind: "testing-candidates", completed: 0, total: 10 },
	{ kind: "testing-candidates", completed: 10, total: 10 },
	{ kind: "selecting" },
	{ kind: "assembling", completed: 0, total: 5 },
	{ kind: "assembling", completed: 5, total: 5 },
	{ kind: "finalizing" },
	{ kind: "completed" },
];

describe("the progress a running report reports", () => {
	it("never goes backwards as the report moves through its phases", () => {
		const progress = PHASES.map(reportProgress);

		expect(progress).toEqual([...progress].sort((a, b) => a - b));
		expect(progress.at(0)).toBe(0);
		expect(progress.at(-1)).toBe(100);
	});

	it("stays inside its phase's share of the bar while that phase runs", () => {
		const quarter = reportProgress({ kind: "testing-candidates", completed: 25, total: 100 });

		expect(quarter).toBeGreaterThan(reportProgress({ kind: "testing-candidates", completed: 0, total: 100 }));
		expect(quarter).toBeLessThan(reportProgress({ kind: "selecting" }));
	});

	it("treats a phase with nothing to do as finished rather than dividing by zero", () => {
		expect(reportProgress({ kind: "assembling", completed: 0, total: 0 })).toBe(
			reportProgress({ kind: "assembling", completed: 1, total: 1 }),
		);
	});

	it("is a whole percent, so the stored column and the rendered bar agree", () => {
		expect(reportProgress({ kind: "testing-candidates", completed: 1, total: 3 })).toBe(50);
	});
});

describe("which reports a worker may claim", () => {
	it("lets a worker pick up a queued report and finish it", () => {
		expect(canAdvanceReport("pending", "processing")).toBe(true);
		expect(canAdvanceReport("processing", "completed")).toBe(true);
		expect(canAdvanceReport("processing", "failed")).toBe(true);
	});

	it("refuses to re-run a report that already finished", () => {
		for (const terminal of ["completed", "failed"] as ReportStatus[]) {
			expect(canAdvanceReport(terminal, "processing")).toBe(false);
		}
	});

	it("refuses to overwrite a finished report with another ending", () => {
		expect(canAdvanceReport("completed", "failed")).toBe(false);
		expect(canAdvanceReport("failed", "completed")).toBe(false);
	});

	it("never puts a report back in the queue", () => {
		expect(canAdvanceReport("processing", "pending")).toBe(false);
	});
});

describe("reports whose worker never came back", () => {
	const now = new Date("2026-01-01T12:00:00Z");
	const ago = (ms: number) => new Date(now.getTime() - ms);
	const HOUR = 60 * 60 * 1000;

	it("fails one that has said nothing for longer than the stale window", () => {
		const stale = [{ id: "dead", status: "processing" as const, updatedAt: ago(3 * HOUR) }];

		expect(abandonedReports(stale, now, 2 * HOUR)).toEqual(["dead"]);
	});

	it("leaves a slow report alone while it is still reporting progress", () => {
		const working = [{ id: "slow", status: "processing" as const, updatedAt: ago(10 * 60 * 1000) }];

		expect(abandonedReports(working, now, 2 * HOUR)).toEqual([]);
	});

	it("catches one that died before it ever started", () => {
		const neverPickedUp = [{ id: "queued", status: "pending" as const, updatedAt: ago(5 * HOUR) }];

		expect(abandonedReports(neverPickedUp, now, 2 * HOUR)).toEqual(["queued"]);
	});

	it("leaves finished reports alone however old they are", () => {
		const old = [
			{ id: "done", status: "completed" as const, updatedAt: ago(1000 * HOUR) },
			{ id: "gone", status: "failed" as const, updatedAt: ago(1000 * HOUR) },
		];

		expect(abandonedReports(old, now, 2 * HOUR)).toEqual([]);
	});
});
