import { PROMPT_JOB_OPTIONS } from "@workspace/lib/queues/prompt-jobs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn().mockResolvedValue("job-id");
const unschedule = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/boss-client", () => ({ getBoss: async () => ({ send, unschedule }) }));
vi.mock("@workspace/lib/db/db", () => ({ db: { query: { prompts: { findFirst: async () => null } } } }));

const { createPromptJobScheduler, sendImmediatePromptJob } = await import("@/lib/job-scheduler");

function sentOptions() {
	return send.mock.calls.at(-1)?.[2] ?? {};
}

beforeEach(() => {
	send.mockClear();
});

/**
 * A process-prompt job that expires mid-fan-out, or is retried after one, pays
 * for the same provider calls twice. The worker's own sends have always said so;
 * these cover the senders in the web app, which used to disagree.
 */
describe("what the web app queues a prompt cycle with", () => {
	it("never lets the queue retry a cycle it has already paid for", async () => {
		await createPromptJobScheduler("prompt-1");
		expect(sentOptions().retryLimit).toBe(0);

		await sendImmediatePromptJob("prompt-1");
		expect(sentOptions().retryLimit).toBe(0);
	});

	it("gives a cycle longer than its slowest provider before expiring it", async () => {
		await createPromptJobScheduler("prompt-1");

		// The fan-out is bounded by the slowest provider's own task ceiling, which
		// runs to the better part of an hour behind a deep enough queue.
		expect(sentOptions().expireInSeconds).toBeGreaterThanOrEqual(60 * 60);
		expect(sentOptions().expireInSeconds).toBe(PROMPT_JOB_OPTIONS.expireInSeconds);
	});

	it("holds the prompt's singleton key so a second send can't double the cycle", async () => {
		await createPromptJobScheduler("prompt-1");

		expect(sentOptions().singletonKey).toBe("prompt-prompt-1");
		expect(sentOptions().singletonSeconds).toBeGreaterThan(0);
	});

	it("runs a manual retry now, even mid-cadence", async () => {
		await sendImmediatePromptJob("prompt-1");

		// The singleton key is what makes a scheduled send idempotent; an operator
		// asking for a run now is deliberately not that.
		expect(sentOptions().singletonKey).toBeUndefined();
		expect(sentOptions().startAfter).toBeUndefined();
	});
});
