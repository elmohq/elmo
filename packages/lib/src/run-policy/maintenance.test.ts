import { describe, expect, it } from "vitest";
import {
	computeMaintenanceDecisions,
	computePoolPositions,
	lastRunQueryWindowMs,
	type MaintenancePromptState,
} from "./maintenance";
import { type PromptRunPlan, targetKey } from "./policy";

const NOW = new Date("2026-08-05T12:00:00Z");
const HOUR = 3600 * 1000;

const CHATGPT = { model: "chatgpt", provider: "brightdata", webSearch: true };
const PERPLEXITY = { model: "perplexity", provider: "brightdata", webSearch: true };

function plan(intervalHours = 24, models = [CHATGPT]): PromptRunPlan {
	return {
		targets: models.map((config) => ({ config, intervalHours, replication: 5 })),
		rescheduleHours: intervalHours,
	};
}

function state(partial: Partial<MaintenancePromptState> & { promptId: string }): MaintenancePromptState {
	return {
		promptCreatedAt: new Date(NOW.getTime() - 10 * 24 * HOUR),
		plan: plan(),
		lastRunAtByKey: new Map(),
		pendingJob: null,
		...partial,
	};
}

describe("computeMaintenanceDecisions", () => {
	it("schedules a fresh job for an overdue prompt with no pending job", () => {
		const decisions = computeMaintenanceDecisions(
			[state({ promptId: "p1", lastRunAtByKey: new Map([[targetKey(CHATGPT), new Date(NOW.getTime() - 30 * HOUR)]]) })],
			NOW,
		);
		expect(decisions.toSchedule).toEqual([{ promptId: "p1", cadenceHours: 24 }]);
		expect(decisions.toExpedite).toEqual([]);
	});

	it("a prompt on schedule needs nothing", () => {
		const decisions = computeMaintenanceDecisions(
			[state({ promptId: "p1", lastRunAtByKey: new Map([[targetKey(CHATGPT), new Date(NOW.getTime() - 2 * HOUR)]]) })],
			NOW,
		);
		expect(decisions.toSchedule).toEqual([]);
		expect(decisions.toExpedite).toEqual([]);
		expect(decisions.alertOverdueCount).toBe(0);
	});

	it("expedites an existing future job when overdue", () => {
		const decisions = computeMaintenanceDecisions(
			[
				state({
					promptId: "p1",
					lastRunAtByKey: new Map([[targetKey(CHATGPT), new Date(NOW.getTime() - 30 * HOUR)]]),
					pendingJob: { jobId: "job-1", state: "created" },
				}),
			],
			NOW,
		);
		expect(decisions.toExpedite).toEqual([{ promptId: "p1", jobId: "job-1" }]);
		expect(decisions.toSchedule).toEqual([]);
	});

	it("throttles expedites when the prompt ran recently on another target", () => {
		const decisions = computeMaintenanceDecisions(
			[
				state({
					promptId: "p1",
					plan: plan(24, [CHATGPT, PERPLEXITY]),
					lastRunAtByKey: new Map([
						// perplexity never records a run (broken provider); chatgpt ran 30m ago
						[targetKey(CHATGPT), new Date(NOW.getTime() - 0.5 * HOUR)],
					]),
					pendingJob: { jobId: "job-1", state: "created" },
				}),
			],
			NOW,
		);
		expect(decisions.toExpedite).toEqual([]);
	});

	it("does not throttle a genuinely stale prompt", () => {
		const decisions = computeMaintenanceDecisions(
			[
				state({
					promptId: "p1",
					plan: plan(24, [CHATGPT, PERPLEXITY]),
					lastRunAtByKey: new Map([[targetKey(CHATGPT), new Date(NOW.getTime() - 2 * HOUR)]]),
					pendingJob: { jobId: "job-1", state: "created" },
				}),
			],
			NOW,
		);
		// chatgpt ran 2h ago (past the 1h expedite floor); perplexity has never run → expedite
		expect(decisions.toExpedite).toEqual([{ promptId: "p1", jobId: "job-1" }]);
	});

	it("leaves active and retry jobs alone", () => {
		for (const jobState of ["active", "retry"] as const) {
			const decisions = computeMaintenanceDecisions(
				[state({ promptId: "p1", pendingJob: { jobId: "job-1", state: jobState } })],
				NOW,
			);
			expect(decisions.toSchedule).toEqual([]);
			expect(decisions.toExpedite).toEqual([]);
		}
	});

	it("a freshly created prompt with no runs is not alert-overdue but is scheduled", () => {
		const decisions = computeMaintenanceDecisions(
			[state({ promptId: "p1", promptCreatedAt: new Date(NOW.getTime() - 5 * 60 * 1000) })],
			NOW,
		);
		expect(decisions.alertOverdueCount).toBe(0);
		expect(decisions.toSchedule).toHaveLength(1);
	});

	it("parked chains (no targets) are ignored entirely — no revival, no alerts", () => {
		const decisions = computeMaintenanceDecisions(
			[
				state({
					promptId: "p1",
					plan: { targets: [], rescheduleHours: null },
					lastRunAtByKey: new Map(),
				}),
			],
			NOW,
		);
		expect(decisions).toEqual({ toSchedule: [], toExpedite: [], alertOverdueCount: 0 });
	});

	it("uses per-target intervals: a 6h target overdue at 7h while a 24h target is fresh", () => {
		const mixed: PromptRunPlan = {
			targets: [
				{ config: CHATGPT, intervalHours: 6, replication: 1 },
				{ config: { model: "claude", provider: "anthropic-api", webSearch: true }, intervalHours: 24, replication: 1 },
			],
			rescheduleHours: 6,
		};
		const decisions = computeMaintenanceDecisions(
			[
				state({
					promptId: "p1",
					plan: mixed,
					lastRunAtByKey: new Map([
						[targetKey(CHATGPT), new Date(NOW.getTime() - 7 * HOUR)],
						[
							targetKey({ model: "claude", provider: "anthropic-api", webSearch: true }),
							new Date(NOW.getTime() - 2 * HOUR),
						],
					]),
				}),
			],
			NOW,
		);
		expect(decisions.toSchedule).toEqual([{ promptId: "p1", cadenceHours: 6 }]);
		expect(decisions.alertOverdueCount).toBe(1);
	});
});

describe("computePoolPositions", () => {
	const prompts = [
		{ id: "a", createdAt: new Date("2026-01-01"), claudeMode: "web" as const },
		{ id: "b", createdAt: new Date("2026-02-01"), claudeMode: null },
		{ id: "c", createdAt: new Date("2026-03-01"), claudeMode: "base" as const },
		{ id: "d", createdAt: new Date("2026-04-01"), claudeMode: "web" as const },
	];

	it("oldest prompts win the pool after a downgrade", () => {
		const { withinPromptPool } = computePoolPositions(prompts, { maxPrompts: 2, claudePool: 10 });
		expect([...withinPromptPool].sort()).toEqual(["a", "b"]);
	});

	it("claude pool counts only in-pool assigned prompts, oldest first", () => {
		const { withinClaudePool } = computePoolPositions(prompts, { maxPrompts: 3, claudePool: 1 });
		expect([...withinClaudePool]).toEqual(["a"]);
	});

	it("null maxPrompts means everything is in the pool", () => {
		const { withinPromptPool, withinClaudePool } = computePoolPositions(prompts, {
			maxPrompts: null,
			claudePool: 10,
		});
		expect(withinPromptPool.size).toBe(4);
		expect([...withinClaudePool].sort()).toEqual(["a", "c", "d"]);
	});

	it("creation-time ties break by id so the ordering is total", () => {
		const tied = [
			{ id: "z", createdAt: new Date("2026-01-01"), claudeMode: null },
			{ id: "y", createdAt: new Date("2026-01-01"), claudeMode: null },
		];
		const { withinPromptPool } = computePoolPositions(tied, { maxPrompts: 1, claudePool: 0 });
		expect([...withinPromptPool]).toEqual(["y"]);
	});
});

describe("lastRunQueryWindowMs", () => {
	it("covers twice the slowest cadence plus grace", () => {
		expect(lastRunQueryWindowMs(24)).toBeGreaterThan(48 * HOUR);
		expect(lastRunQueryWindowMs(24)).toBeLessThan(50 * HOUR);
	});
});
