import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderFatalError, ProviderUnavailableError, resetProviderLimiters, withProviderSlot } from "./limiter";

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Let queued microtasks settle so gate hand-offs land before assertions. */
function flush(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
	resetProviderLimiters();
	// Only the clock is faked — the gate hands slots over through microtasks, and
	// flush() needs a real setImmediate to let them land.
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	resetProviderLimiters();
});

describe("withProviderSlot", () => {
	it("never runs more calls at once than the configured concurrency", async () => {
		vi.stubEnv("PROVIDER_MAX_CONCURRENCY", "2");

		let running = 0;
		let peak = 0;
		const gates = Array.from({ length: 6 }, () => deferred());

		const calls = gates.map((gate) =>
			withProviderSlot("cloro", async () => {
				running++;
				peak = Math.max(peak, running);
				await gate.promise;
				running--;
			}),
		);

		await flush();
		expect(peak).toBe(2);

		// Releasing one call admits exactly one waiter, never more.
		gates[0].resolve();
		await flush();
		expect(peak).toBe(2);

		for (const gate of gates) gate.resolve();
		await Promise.all(calls);
		expect(peak).toBe(2);
	});

	it("admits a waiter when the call holding the slot throws", async () => {
		vi.stubEnv("PROVIDER_MAX_CONCURRENCY", "1");

		const first = deferred();
		const failing = withProviderSlot("cloro", async () => {
			await first.promise;
			throw new Error("boom");
		});
		let secondRan = false;
		const second = withProviderSlot("cloro", async () => {
			secondRan = true;
		});

		await flush();
		expect(secondRan).toBe(false);

		first.resolve();
		await expect(failing).rejects.toThrow("boom");
		await second;
		expect(secondRan).toBe(true);
	});

	it("pauses a provider that fails five calls in a row, then resumes after the cooldown", async () => {
		const fail = () =>
			withProviderSlot("cloro", async () => {
				throw new Error("upstream blocked");
			});

		for (let i = 0; i < 5; i++) {
			await expect(fail()).rejects.toThrow("upstream blocked");
		}

		// Sixth call never reaches the provider — nothing is submitted, nothing billed.
		await expect(fail()).rejects.toThrow(ProviderUnavailableError);

		vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
		await expect(fail()).rejects.toThrow("upstream blocked");
	});

	it("keeps the breaker closed when failures are broken up by a success", async () => {
		const fail = () =>
			withProviderSlot("cloro", async () => {
				throw new Error("transient");
			});

		for (let i = 0; i < 4; i++) {
			await expect(fail()).rejects.toThrow("transient");
		}
		await expect(withProviderSlot("cloro", async () => "ok")).resolves.toBe("ok");
		for (let i = 0; i < 4; i++) {
			await expect(fail()).rejects.toThrow("transient");
		}

		await expect(withProviderSlot("cloro", async () => "ok")).resolves.toBe("ok");
	});

	it("pauses immediately on a fatal error rather than spending four more calls", async () => {
		await expect(
			withProviderSlot("cloro", async () => {
				throw new ProviderFatalError("Cloro task submission failed (403: INSUFFICIENT_CREDITS)");
			}),
		).rejects.toThrow(ProviderFatalError);

		await expect(withProviderSlot("cloro", async () => "ok")).rejects.toThrow(ProviderUnavailableError);

		// Fatal conditions need a human, so the pause outlasts the ordinary one.
		vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
		await expect(withProviderSlot("cloro", async () => "ok")).rejects.toThrow(ProviderUnavailableError);

		vi.setSystemTime(Date.now() + 30 * 60 * 1000);
		await expect(withProviderSlot("cloro", async () => "ok")).resolves.toBe("ok");
	});

	it("keeps each provider's gate and breaker independent", async () => {
		for (let i = 0; i < 5; i++) {
			await expect(
				withProviderSlot("cloro", async () => {
					throw new Error("down");
				}),
			).rejects.toThrow("down");
		}

		await expect(withProviderSlot("cloro", async () => "ok")).rejects.toThrow(ProviderUnavailableError);
		await expect(withProviderSlot("olostep", async () => "ok")).resolves.toBe("ok");
	});
});
