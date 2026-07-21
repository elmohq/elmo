import { PLANS, UNLIMITED_COUNT } from "@workspace/config/plans";
import { UNLIMITED_ENTITLEMENTS } from "@workspace/lib/config/entitlements";
import { REGISTRY } from "@workspace/lib/config/registry";
import { RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { describe, expect, it } from "vitest";
import {
	allowedRunsPerDay,
	fastestCadenceHours,
	isDue,
	isPromptOverdueByTargets,
	orgAssignableBudget,
	rescheduleCadenceHours,
	RUN_WINDOW_MS,
	type RunPolicyTarget,
	selectRunnableTargets,
	targetIdentityKey,
	targetRunHistory,
} from "./run-policy";

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse("2026-07-15T12:00:00Z");

function target(
	overrides: Partial<RunPolicyTarget> & { runPolicy?: RunPolicyTarget["runPolicy"] } = {},
): RunPolicyTarget {
	return {
		model: "chatgpt",
		provider: "olostep",
		webSearch: true,
		runPolicy: { replication: 5, cadenceHours: 24 },
		...overrides,
	};
}

const claudeTarget = (runPolicy = { replication: 1, cadenceHours: 24 }): RunPolicyTarget => ({
	model: "claude",
	provider: "anthropic-api",
	webSearch: true,
	runPolicy,
});

/** Cloud pro-plan shape: pool 20, claude 1/day, standard 4/day. */
const PRO = { claudePromptPool: PLANS.pro.claudePromptPool, maxRunsPerDay: PLANS.pro.maxRunsPerDay };

function decide(
	overrides: Partial<Parameters<typeof selectRunnableTargets<RunPolicyTarget>>[0]> = {},
): ReturnType<typeof selectRunnableTargets<RunPolicyTarget>> {
	return selectRunnableTargets({
		targets: [target()],
		bypassDue: false,
		nowMs: NOW,
		lastRunAtMsByKey: new Map(),
		recentCountByKey: new Map(),
		entitlements: UNLIMITED_ENTITLEMENTS,
		orgAssignableUsedByModel: new Map(),
		...overrides,
	});
}

describe("targetIdentityKey", () => {
	it("separates providers and web/base variants of one model", () => {
		const base = targetIdentityKey({ model: "claude", provider: "anthropic-api", webSearch: false });
		const web = targetIdentityKey({ model: "claude", provider: "anthropic-api", webSearch: true });
		const openrouter = targetIdentityKey({ model: "claude", provider: "openrouter", webSearch: true });
		expect(new Set([base, web, openrouter]).size).toBe(3);
	});

	it("maps a null provider to the legacy key", () => {
		expect(targetIdentityKey({ model: "chatgpt", provider: null, webSearch: true })).toBe(
			targetIdentityKey({ model: "chatgpt", provider: "", webSearch: true } as never),
		);
	});
});

describe("isDue", () => {
	it("marks never-run targets due", () => {
		expect(isDue(undefined, 24, NOW)).toBe(true);
	});

	it("is due exactly at the cadence boundary", () => {
		expect(isDue(NOW - 24 * HOUR_MS, 24, NOW)).toBe(true);
	});

	it("is not due just under the cadence", () => {
		expect(isDue(NOW - 24 * HOUR_MS + 1, 24, NOW)).toBe(false);
	});
});

describe("allowedRunsPerDay", () => {
	it("is replication × 24 / cadence", () => {
		expect(allowedRunsPerDay({ replication: 5, cadenceHours: 24 })).toBe(5);
		expect(allowedRunsPerDay({ replication: 2, cadenceHours: 12 })).toBe(4);
		expect(allowedRunsPerDay({ replication: 1, cadenceHours: 48 })).toBe(0.5);
	});
});

describe("orgAssignableBudget", () => {
	it("is pool × per-model ceiling on a capped plan", () => {
		expect(orgAssignableBudget(PRO, "claude")).toBe(20);
	});

	it("falls back to the '*' ceiling when the model has no entry", () => {
		expect(orgAssignableBudget({ claudePromptPool: 3, maxRunsPerDay: { "*": 2 } }, "claude")).toBe(6);
	});

	it("returns no cap without a maxRunsPerDay map (non-cloud)", () => {
		expect(orgAssignableBudget(UNLIMITED_ENTITLEMENTS, "claude")).toBeNull();
	});

	it("returns no cap when neither the model nor '*' has a ceiling", () => {
		expect(orgAssignableBudget({ claudePromptPool: 5, maxRunsPerDay: { chatgpt: 4 } }, "claude")).toBeNull();
	});

	it("short-circuits the unlimited pool sentinel before multiplying", () => {
		expect(
			orgAssignableBudget({ claudePromptPool: UNLIMITED_COUNT, maxRunsPerDay: { claude: 1 } }, "claude"),
		).toBeNull();
	});

	it("is zero for a zero pool (paywall state)", () => {
		expect(orgAssignableBudget({ claudePromptPool: 0, maxRunsPerDay: { claude: 1 } }, "claude")).toBe(0);
	});
});

describe("selectRunnableTargets — dueness", () => {
	it("runs never-run targets and skips fresh ones per target under mixed cadences", () => {
		const daily = target();
		const slow = target({ provider: "brightdata", runPolicy: { replication: 5, cadenceHours: 48 } });
		const lastRunAtMsByKey = new Map([[targetIdentityKey(slow), NOW - 25 * HOUR_MS]]);
		const { runnable, skipped } = decide({ targets: [daily, slow], lastRunAtMsByKey });
		expect(runnable).toEqual([daily]);
		expect(skipped).toEqual([{ target: slow, reason: "not-due" }]);
	});

	it("uses the legacy null-provider history for dueness", () => {
		const t = target();
		const legacyKey = targetIdentityKey({ model: t.model, provider: null, webSearch: t.webSearch });
		const { runnable, skipped } = decide({ lastRunAtMsByKey: new Map([[legacyKey, NOW - 1 * HOUR_MS]]) });
		expect(runnable).toEqual([]);
		expect(skipped[0].reason).toBe("not-due");
	});

	it("takes the later of the exact and legacy timestamps", () => {
		const t = target();
		const lastRunAtMsByKey = new Map([
			[targetIdentityKey(t), NOW - 30 * HOUR_MS],
			[targetIdentityKey({ model: t.model, provider: null, webSearch: t.webSearch }), NOW - 1 * HOUR_MS],
		]);
		expect(decide({ lastRunAtMsByKey }).runnable).toEqual([]);
	});
});

describe("selectRunnableTargets — budgets", () => {
	it("force bypasses the due check but never the per-target budget", () => {
		const t = target();
		const fresh = new Map([[targetIdentityKey(t), NOW - 1 * HOUR_MS]]);

		const forced = decide({ bypassDue: true, lastRunAtMsByKey: fresh });
		expect(forced.runnable).toEqual([t]);

		const spent = decide({
			bypassDue: true,
			lastRunAtMsByKey: fresh,
			recentCountByKey: new Map([[targetIdentityKey(t), 5]]),
		});
		expect(spent.runnable).toEqual([]);
		expect(spent.skipped).toEqual([{ target: t, reason: "target-budget-exhausted" }]);
	});

	it("counts legacy null-provider runs toward the per-target budget", () => {
		const t = target();
		const legacyKey = targetIdentityKey({ model: t.model, provider: null, webSearch: t.webSearch });
		const { runnable, skipped } = decide({
			bypassDue: true,
			recentCountByKey: new Map([
				[targetIdentityKey(t), 3],
				[legacyKey, 2],
			]),
		});
		expect(runnable).toEqual([]);
		expect(skipped[0].reason).toBe("target-budget-exhausted");
	});

	it("force never bypasses the org-wide assignable budget", () => {
		const claude = claudeTarget();
		const { runnable, skipped } = decide({
			targets: [claude],
			bypassDue: true,
			entitlements: PRO,
			orgAssignableUsedByModel: new Map([["claude", 20]]),
		});
		expect(runnable).toEqual([]);
		expect(skipped).toEqual([{ target: claude, reason: "org-budget-exhausted" }]);
	});

	it("meters the org budget on history, so churn across prompts cannot double-spend", () => {
		// Assign claude to prompt A, run it, unassign, assign to prompt B: B's job
		// sees A's runs in the org window and stops at the pool budget.
		const claude = claudeTarget();
		const pool1 = { claudePromptPool: 1, maxRunsPerDay: { claude: 1 } };

		const promptA = decide({ targets: [claude], entitlements: pool1, orgAssignableUsedByModel: new Map() });
		expect(promptA.runnable).toEqual([claude]);

		const promptB = decide({
			targets: [claude],
			entitlements: pool1,
			orgAssignableUsedByModel: new Map([["claude", 1]]),
		});
		expect(promptB.runnable).toEqual([]);
		expect(promptB.skipped[0].reason).toBe("org-budget-exhausted");
	});

	it("accrues admitted replication within one job so co-scheduled assignable targets share the budget", () => {
		const base = claudeTarget({ replication: 1, cadenceHours: 24 });
		const web = { ...claudeTarget({ replication: 1, cadenceHours: 24 }), webSearch: false };
		const { runnable, skipped } = decide({
			targets: [base, web],
			entitlements: { claudePromptPool: 1, maxRunsPerDay: { claude: 1 } },
		});
		expect(runnable).toEqual([base]);
		expect(skipped).toEqual([{ target: web, reason: "org-budget-exhausted" }]);
	});

	it("applies no org budget to standard models even when the org has spent heavily", () => {
		const { runnable } = decide({
			entitlements: PRO,
			orgAssignableUsedByModel: new Map([["chatgpt", 10_000]]),
		});
		expect(runnable).toHaveLength(1);
	});

	it("never caps unlimited (non-cloud) entitlements and never overflows on the sentinel", () => {
		const claude = claudeTarget();
		const { runnable } = decide({
			targets: [claude],
			entitlements: UNLIMITED_ENTITLEMENTS,
			orgAssignableUsedByModel: new Map([["claude", Number.MAX_SAFE_INTEGER - 1]]),
		});
		expect(runnable).toEqual([claude]);
	});
});

describe("uniform-cadence volume equivalence (legacy 5×/day)", () => {
	// The resolver's registry defaults reproduce the legacy shape: replication 5
	// (RUNS_PER_PROMPT) at 24h cadence. Completion-anchored firings a full cadence
	// apart must admit every firing; a mid-period (expedited/forced) firing must
	// admit nothing — exactly RUNS_PER_PROMPT runs per day per target.
	const defaultPolicy = {
		replication: REGISTRY["run.replication"].default,
		cadenceHours: REGISTRY["run.cadence_hours"].default,
	};
	const t = target({ runPolicy: defaultPolicy });

	it("matches the legacy constant", () => {
		expect(defaultPolicy.replication).toBe(RUNS_PER_PROMPT);
		expect(allowedRunsPerDay(defaultPolicy)).toBe(RUNS_PER_PROMPT);
	});

	it("admits each completion-anchored firing and blocks mid-period refires", () => {
		const key = targetIdentityKey(t);
		let nowMs = NOW;
		const lastRunAtMsByKey = new Map<string, number>();
		const recentCountByKey = new Map<string, number>();
		let totalRuns = 0;

		for (let firing = 0; firing < 3; firing++) {
			const { runnable } = decide({ targets: [t], nowMs, lastRunAtMsByKey, recentCountByKey });
			expect(runnable).toEqual([t]);
			totalRuns += t.runPolicy.replication;
			lastRunAtMsByKey.set(key, nowMs);
			recentCountByKey.set(key, t.runPolicy.replication); // all runs inside the fresh window

			// A maintenance expedite (or admin force) 12h in cannot add volume: the
			// due check blocks it, and even force hits the spent 24h budget.
			const midMs = nowMs + 12 * HOUR_MS;
			expect(decide({ targets: [t], nowMs: midMs, lastRunAtMsByKey, recentCountByKey }).skipped[0].reason).toBe(
				"not-due",
			);
			expect(
				decide({ targets: [t], bypassDue: true, nowMs: midMs, lastRunAtMsByKey, recentCountByKey }).skipped[0].reason,
			).toBe("target-budget-exhausted");

			// Next completion-anchored firing: a hair past the full cadence, with the
			// previous firing's runs aged out of the trailing window.
			nowMs += RUN_WINDOW_MS + 60_000;
			recentCountByKey.set(key, 0);
		}

		expect(totalRuns).toBe(3 * RUNS_PER_PROMPT);
	});
});

describe("reschedule decision", () => {
	it("uses the fastest cadence among the targets", () => {
		const targets = [target(), target({ provider: "brightdata", runPolicy: { replication: 1, cadenceHours: 6 } })];
		expect(rescheduleCadenceHours(targets, 24)).toBe(6);
		expect(fastestCadenceHours(targets, 24)).toBe(6);
	});

	it("uniform cadence keeps today's shape", () => {
		expect(rescheduleCadenceHours([target(), target({ provider: "brightdata" })], 48)).toBe(24);
	});

	it("returns null for zero targets — the prompt must not self-reschedule (A8b)", () => {
		expect(rescheduleCadenceHours([], 24)).toBeNull();
	});

	it("fastestCadenceHours falls back when empty", () => {
		expect(fastestCadenceHours([], 48)).toBe(48);
	});
});

describe("targetRunHistory", () => {
	it("merges exact and legacy keys: later timestamp, summed counts", () => {
		const t = target();
		const exact = targetIdentityKey(t);
		const legacy = targetIdentityKey({ model: t.model, provider: null, webSearch: t.webSearch });
		const history = targetRunHistory(
			t,
			new Map([
				[exact, NOW - 30 * HOUR_MS],
				[legacy, NOW - 2 * HOUR_MS],
			]),
			new Map([
				[exact, 2],
				[legacy, 3],
			]),
		);
		expect(history.lastRunAtMs).toBe(NOW - 2 * HOUR_MS);
		expect(history.recentCount).toBe(5);
	});

	it("treats absent history as never-run", () => {
		expect(targetRunHistory(target(), new Map(), new Map())).toEqual({ lastRunAtMs: undefined, recentCount: 0 });
	});
});

describe("isPromptOverdueByTargets (maintenance watchdog)", () => {
	const createdLongAgo = new Date(NOW - 100 * HOUR_MS);

	it("judges each target at its own resolved cadence", () => {
		const daily = target();
		const slow = target({ provider: "brightdata", runPolicy: { replication: 5, cadenceHours: 48 } });
		const lastRunAtByKey = new Map([
			[targetIdentityKey(daily), new Date(NOW - 2 * HOUR_MS)],
			[targetIdentityKey(slow), new Date(NOW - 47 * HOUR_MS)],
		]);
		expect(
			isPromptOverdueByTargets({ targets: [daily, slow], lastRunAtByKey, promptCreatedAt: createdLongAgo, now: NOW }),
		).toBe(false);

		lastRunAtByKey.set(targetIdentityKey(daily), new Date(NOW - 25 * HOUR_MS));
		expect(
			isPromptOverdueByTargets({ targets: [daily, slow], lastRunAtByKey, promptCreatedAt: createdLongAgo, now: NOW }),
		).toBe(true);
	});

	it("only consults the resolved targets (no oversampling from unselected models)", () => {
		// A brand tracking a subset: models outside its resolved targets simply are
		// not in the list, so their missing runs cannot mark the prompt overdue.
		const daily = target();
		const lastRunAtByKey = new Map([[targetIdentityKey(daily), new Date(NOW - 1 * HOUR_MS)]]);
		expect(
			isPromptOverdueByTargets({ targets: [daily], lastRunAtByKey, promptCreatedAt: createdLongAgo, now: NOW }),
		).toBe(false);
	});

	it("treats a never-run target as overdue only past the grace window", () => {
		const graceMs = 30 * 60 * 1000;
		const freshPrompt = new Date(NOW - 10 * 60 * 1000);
		expect(
			isPromptOverdueByTargets({
				targets: [target()],
				lastRunAtByKey: new Map(),
				promptCreatedAt: freshPrompt,
				now: NOW,
				graceMs,
			}),
		).toBe(false);
		expect(
			isPromptOverdueByTargets({
				targets: [target()],
				lastRunAtByKey: new Map(),
				promptCreatedAt: createdLongAgo,
				now: NOW,
				graceMs,
			}),
		).toBe(true);
	});

	it("honors legacy null-provider history", () => {
		const t = target();
		const lastRunAtByKey = new Map([
			[targetIdentityKey({ model: t.model, provider: null, webSearch: t.webSearch }), new Date(NOW - 1 * HOUR_MS)],
		]);
		expect(isPromptOverdueByTargets({ targets: [t], lastRunAtByKey, promptCreatedAt: createdLongAgo, now: NOW })).toBe(
			false,
		);
	});

	it("zero targets is never overdue (idle A8b prompts are not alert noise)", () => {
		expect(
			isPromptOverdueByTargets({ targets: [], lastRunAtByKey: new Map(), promptCreatedAt: createdLongAgo, now: NOW }),
		).toBe(false);
	});
});
