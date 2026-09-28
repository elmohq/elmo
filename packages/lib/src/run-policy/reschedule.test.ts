import { describe, expect, it, vi } from "vitest";
import {
	ensureChainJob,
	ensureNextRunScheduled,
	PROMPT_JOB_OPTIONS,
	PROMPT_RUN_MAX_SECONDS,
	promptChainSingletonKey,
	type RescheduleDeps,
} from "./reschedule";

const PROMPT = "11111111-2222-3333-4444-555555555555";

/**
 * A fake pg-boss chain store faithful to the production failure modes:
 * `send` with singletonSeconds resolves null whenever ANY job with the same
 * singleton key was created in the same throttle slot — including one that has
 * already completed (the slot does not care about state) — while an
 * unthrottled send always inserts (a standard-policy queue cannot dedupe a
 * bare singletonKey). `created` jobs are the live chain.
 */
function chainStore(initial: { key: string; state: "created" | "completed" | "cancelled" }[] = []) {
	const jobs: { id: string; key: string; state: "created" | "completed" | "cancelled" }[] = initial.map((j, i) => ({
		id: `seed-${i}`,
		...j,
	}));
	let nextId = 1;
	const sentOptions: Record<string, unknown>[] = [];
	const deps: RescheduleDeps = {
		send: vi.fn(async (_queue, _data, options) => {
			sentOptions.push(options);
			const key = options.singletonKey as string;
			if (options.singletonSeconds !== undefined && jobs.some((j) => j.key === key)) return null;
			const id = `job-${nextId++}`;
			jobs.push({ id, key, state: "created" });
			return id;
		}),
		listScheduledChainJobs: vi.fn(async (key) =>
			jobs.filter((j) => j.key === key && j.state === "created").map((j) => j.id),
		),
		cancelChainJob: vi.fn(async (jobId) => {
			const job = jobs.find((j) => j.id === jobId);
			if (job && job.state === "created") job.state = "cancelled";
		}),
	};
	return { jobs, deps, sentOptions, send: deps.send as ReturnType<typeof vi.fn> };
}

function createdJobs(store: ReturnType<typeof chainStore>) {
	return store.jobs.filter((j) => j.state === "created");
}

describe("ensureNextRunScheduled", () => {
	// F05R-F2 #1/#4 — a forced run completing while the canonical future chain
	// exists must not create a second chain: nothing is sent at all.
	it("keeps the existing future chain and sends nothing", async () => {
		const store = chainStore([{ key: promptChainSingletonKey(PROMPT), state: "created" }]);
		const outcome = await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		expect(outcome).toEqual({ status: "existing" });
		expect(store.send).not.toHaveBeenCalled();
		expect(createdJobs(store)).toHaveLength(1);
	});

	// F05R-F2 #2 — no future schedule: exactly one chain job is created.
	it("creates exactly one chain job when none exists", async () => {
		const store = chainStore();
		const outcome = await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		expect(outcome).toMatchObject({ status: "scheduled" });
		expect(store.jobs).toHaveLength(1);
		expect(store.sentOptions[0]).toMatchObject({
			singletonKey: promptChainSingletonKey(PROMPT),
			startAfter: 12 * 3600,
			singletonSeconds: 12 * 3600,
		});
	});

	// F05R-F2 — the production chain-death bug: the throttle slot is occupied by
	// a COMPLETED job, send resolves null, and no live chain exists. The chain
	// must be revived, not silently dropped.
	it("revives the chain when the throttled send is nulled by a completed job", async () => {
		const store = chainStore([{ key: promptChainSingletonKey(PROMPT), state: "completed" }]);
		const outcome = await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		expect(outcome).toMatchObject({ status: "revived" });
		expect(createdJobs(store)).toHaveLength(1);
		// The revive send must not carry the slot throttle that nulled the first.
		expect(store.sentOptions[1].singletonSeconds).toBeUndefined();
	});

	// F05R-F2 #3 — two force requests in sequence leave exactly one future chain.
	it("leaves exactly one future chain after two sequential reschedules", async () => {
		const store = chainStore();
		const first = await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		const second = await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		expect(first).toMatchObject({ status: "scheduled" });
		expect(second).toEqual({ status: "existing" });
		expect(createdJobs(store)).toHaveLength(1);
	});

	// F05R-F2 #5/#6 — every chain send carries the shared options: retryLimit 0
	// and the 90-minute production cycle expiry, from one source of truth.
	it("sends every chain job with retryLimit 0 and the 90-minute expiry", async () => {
		expect(PROMPT_RUN_MAX_SECONDS).toBe(90 * 60);
		expect(PROMPT_JOB_OPTIONS).toEqual({
			retryLimit: 0,
			retryDelay: 0,
			retryBackoff: false,
			expireInSeconds: PROMPT_RUN_MAX_SECONDS,
		});
		const throttled = chainStore([{ key: promptChainSingletonKey(PROMPT), state: "completed" }]);
		await ensureNextRunScheduled(PROMPT, 12, 0, throttled.deps);
		for (const options of throttled.sentOptions) {
			expect(options).toMatchObject({ retryLimit: 0, expireInSeconds: 90 * 60 });
		}
	});

	// F05R-F2 #7 — only the prompt's own singleton key is ever read or written;
	// another prompt's chain is untouched by key scoping.
	it("scopes every read and send to the prompt's own singleton key", async () => {
		const otherKey = promptChainSingletonKey("99999999-8888-7777-6666-555555555555");
		const store = chainStore([{ key: otherKey, state: "created" }]);
		const outcome = await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		expect(outcome).toMatchObject({ status: "scheduled" });
		expect(store.deps.listScheduledChainJobs).toHaveBeenCalledWith(promptChainSingletonKey(PROMPT));
		for (const options of store.sentOptions) {
			expect(options.singletonKey).toBe(promptChainSingletonKey(PROMPT));
		}
		expect(store.jobs.filter((j) => j.key === otherKey)).toHaveLength(1);
	});

	// A racing sender that committed its chain between the null send and the
	// re-check is respected — no revive, no duplicate.
	it("does not revive when a racing sender already created the chain", async () => {
		let checks = 0;
		const send = vi.fn(async () => null);
		const outcome = await ensureNextRunScheduled(PROMPT, 12, 0, {
			send,
			listScheduledChainJobs: async () => (++checks === 2 ? ["racer-job"] : []), // absent before send, present after
			cancelChainJob: async () => {},
		});
		expect(outcome).toEqual({ status: "existing" });
		expect(send).toHaveBeenCalledTimes(1);
	});

	// SCHED-01 rehearsal regression — three completions of one prompt's jobs can
	// each pass the pre-check before any revive commits (the unthrottled resend
	// is not deduped by a standard-policy queue). Every racer's convergence
	// sweep must leave exactly one created chain job.
	it("converges concurrent revives onto exactly one chain job", async () => {
		const store = chainStore([{ key: promptChainSingletonKey(PROMPT), state: "completed" }]);
		await Promise.all([
			ensureNextRunScheduled(PROMPT, 12, 0, store.deps),
			ensureNextRunScheduled(PROMPT, 12, 0, store.deps),
			ensureNextRunScheduled(PROMPT, 12, 0, store.deps),
		]);
		// One more pass models the next completion; whatever the race left, the
		// store must already be (and stay) at exactly one created job.
		await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		expect(createdJobs(store)).toHaveLength(1);
	});

	it("sweeps pre-existing duplicate chain jobs down to the oldest one", async () => {
		const key = promptChainSingletonKey(PROMPT);
		const store = chainStore([
			{ key, state: "created" },
			{ key, state: "created" },
			{ key, state: "created" },
		]);
		const outcome = await ensureNextRunScheduled(PROMPT, 12, 0, store.deps);
		expect(outcome).toEqual({ status: "existing" });
		expect(createdJobs(store)).toHaveLength(1);
		expect(createdJobs(store)[0].id).toBe("seed-0");
		expect(store.send).not.toHaveBeenCalled();
	});

	// The failure backoff still shortens the delay on failed cycles.
	it("applies the failure backoff to the chain delay", async () => {
		const store = chainStore();
		await ensureNextRunScheduled(PROMPT, 12, 1, store.deps);
		const startAfter = store.sentOptions[0].startAfter as number;
		expect(startAfter).toBeLessThan(12 * 3600);
		expect(startAfter).toBeGreaterThan(0);
	});
});

describe("ensureChainJob", () => {
	it("starts a chain at the given delay and uses the hour slot for an immediate start", async () => {
		const store = chainStore();
		const spread = await ensureChainJob(PROMPT, 5_400, 0, store.deps);
		expect(spread).toMatchObject({ status: "scheduled" });
		expect(store.sentOptions[0]).toMatchObject({ startAfter: 5_400, singletonSeconds: 5_400 });

		const other = chainStore();
		await ensureChainJob(PROMPT, 0, 0, other.deps);
		expect(other.sentOptions[0]).toMatchObject({ startAfter: 0, singletonSeconds: 3_600, ...PROMPT_JOB_OPTIONS });
	});

	it("is idempotent: an existing chain is kept, a second start sends nothing", async () => {
		const store = chainStore();
		await ensureChainJob(PROMPT, 120, 0, store.deps);
		const again = await ensureChainJob(PROMPT, 240, 0, store.deps);
		expect(again).toEqual({ status: "existing" });
		expect(store.send).toHaveBeenCalledTimes(1);
		expect(createdJobs(store)).toHaveLength(1);
	});

	it("revives a start whose slot is occupied by the previous chain's finished job", async () => {
		const store = chainStore([{ key: promptChainSingletonKey(PROMPT), state: "completed" }]);
		const outcome = await ensureChainJob(PROMPT, 0, 0, store.deps);
		expect(outcome).toMatchObject({ status: "revived" });
		expect(createdJobs(store)).toHaveLength(1);
	});
});
