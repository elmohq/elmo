import { describe, expect, it } from "vitest";
import { FAILURE_BACKOFF_HOURS } from "../run-backoff";
import { afterPromptCycle, decidePromptCycle, type PromptCycleState } from "./cycle";
import { type TargetPlan, targetKey } from "./policy";

const NOW = new Date("2026-01-01T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

function target(model = "chatgpt", intervalHours = 24): TargetPlan {
	return { config: { provider: "openai", model, webSearch: false }, intervalHours, replication: 1 };
}

function state(overrides: Partial<PromptCycleState> = {}): PromptCycleState {
	return {
		prompt: { enabled: true },
		brand: { enabled: true, delayOverrideHours: null },
		defaultDelayHours: 24,
		plan: { targets: [target()], rescheduleHours: 24 },
		lastRunAtByKey: new Map(),
		dailyRunCeiling: null,
		...overrides,
	};
}

const neverOverCeiling = async () => false;
const alwaysOverCeiling = async () => true;

describe("what a prompt's firing decides to do", () => {
	it("runs the targets that are due", async () => {
		const action = await decidePromptCycle(state(), NOW, neverOverCeiling);

		expect(action).toMatchObject({ kind: "run", rescheduleHours: 24 });
	});

	it("runs only the targets that are due, not the whole plan", async () => {
		const fresh = target("chatgpt", 24);
		const stale = target("claude", 24);
		const action = await decidePromptCycle(
			state({
				plan: { targets: [fresh, stale], rescheduleHours: 24 },
				lastRunAtByKey: new Map([[targetKey(fresh.config), new Date(NOW.getTime() - HOUR_MS)]]),
			}),
			NOW,
			neverOverCeiling,
		);

		expect(action.kind === "run" && action.targets.map((t) => t.config.model)).toEqual(["claude"]);
	});

	it("ends the chain when the prompt or its brand is gone", async () => {
		expect(await decidePromptCycle(state({ prompt: null }), NOW, neverOverCeiling)).toEqual({
			kind: "stop",
			reason: "prompt-gone",
		});
		expect(await decidePromptCycle(state({ brand: null }), NOW, neverOverCeiling)).toEqual({
			kind: "stop",
			reason: "prompt-gone",
		});
	});

	it("keeps a disabled prompt's chain alive, so enabling it again starts it", async () => {
		const action = await decidePromptCycle(state({ prompt: { enabled: false } }), NOW, neverOverCeiling);

		expect(action).toEqual({ kind: "reschedule", delayHours: 24, consecutiveFailures: 0, reason: "disabled" });
	});

	it("keeps a disabled prompt's chain alive without knowing its plan", async () => {
		const action = await decidePromptCycle(
			state({ prompt: { enabled: false }, plan: { targets: [], rescheduleHours: null } }),
			NOW,
			neverOverCeiling,
		);

		expect(action).toMatchObject({ kind: "reschedule", reason: "disabled" });
	});

	it("waits at the brand's own cadence while it is disabled", async () => {
		const action = await decidePromptCycle(
			state({ brand: { enabled: false, delayOverrideHours: 6 } }),
			NOW,
			neverOverCeiling,
		);

		expect(action).toMatchObject({ kind: "reschedule", delayHours: 6 });
	});

	it("parks a prompt whose org is no longer entitled to run it", async () => {
		const action = await decidePromptCycle(
			state({ plan: { targets: [], rescheduleHours: null } }),
			NOW,
			neverOverCeiling,
		);

		expect(action).toEqual({ kind: "stop", reason: "no-runnable-targets" });
	});

	it("parks a prompt whose brand has picked no platforms", async () => {
		const action = await decidePromptCycle(
			state({ plan: { targets: [], rescheduleHours: 24 } }),
			NOW,
			neverOverCeiling,
		);

		expect(action).toEqual({ kind: "stop", reason: "no-runnable-targets" });
	});

	it("spends nothing when it fired early and everything is still fresh", async () => {
		const only = target();
		const action = await decidePromptCycle(
			state({ lastRunAtByKey: new Map([[targetKey(only.config), new Date(NOW.getTime() - HOUR_MS)]]) }),
			NOW,
			neverOverCeiling,
		);

		expect(action).toEqual({ kind: "reschedule", delayHours: 24, consecutiveFailures: 0, reason: "nothing-due" });
	});

	it("holds a runaway org at its ceiling without ending its chain", async () => {
		const action = await decidePromptCycle(state({ dailyRunCeiling: 100 }), NOW, alwaysOverCeiling);

		expect(action).toEqual({
			kind: "reschedule",
			delayHours: 24,
			consecutiveFailures: 0,
			reason: "over-daily-ceiling",
		});
	});

	it("doesn't pay for a usage scan it can't act on", async () => {
		let asked = false;
		const countAsk = async () => {
			asked = true;
			return false;
		};

		await decidePromptCycle(state({ prompt: { enabled: false }, dailyRunCeiling: 100 }), NOW, countAsk);
		await decidePromptCycle(
			state({ plan: { targets: [], rescheduleHours: null }, dailyRunCeiling: 100 }),
			NOW,
			countAsk,
		);

		expect(asked).toBe(false);
	});
});

describe("what a prompt does after its runs settle", () => {
	it("goes back on cadence when anything came back", async () => {
		const next = afterPromptCycle({ attempted: 4, succeeded: 1, rescheduleHours: 24, consecutiveFailures: 3 });

		expect(next).toEqual({ kind: "reschedule", delayHours: 24, consecutiveFailures: 0, reason: "ran" });
	});

	it("backs off, and lengthens the backoff, while every run keeps failing", async () => {
		const first = afterPromptCycle({ attempted: 2, succeeded: 0, rescheduleHours: 24, consecutiveFailures: 0 });
		const second = afterPromptCycle({ attempted: 2, succeeded: 0, rescheduleHours: 24, consecutiveFailures: 1 });

		expect(first.consecutiveFailures).toBe(1);
		expect(first.delayHours).toBe(FAILURE_BACKOFF_HOURS[0]);
		expect(second.delayHours).toBeGreaterThan(first.delayHours);
	});

	it("never backs off past the cadence, so an outage costs what health costs", async () => {
		const exhausted = afterPromptCycle({
			attempted: 2,
			succeeded: 0,
			rescheduleHours: 1,
			consecutiveFailures: FAILURE_BACKOFF_HOURS.length + 5,
		});

		expect(exhausted.delayHours).toBe(1);
	});

	it("doesn't count a cycle that attempted nothing as a failure", async () => {
		const next = afterPromptCycle({ attempted: 0, succeeded: 0, rescheduleHours: 24, consecutiveFailures: 2 });

		expect(next.consecutiveFailures).toBe(0);
	});
});
