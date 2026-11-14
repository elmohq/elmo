import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDbWatchdog } from "./db-watchdog";

const MINUTE = 60_000;

describe("startDbWatchdog", () => {
	let stop: (() => void) | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		stop?.();
		vi.useRealTimers();
	});

	it("never reports pools that keep answering", async () => {
		const onUnhealthy = vi.fn();
		stop = startDbWatchdog({ probes: { app: async () => {} }, onUnhealthy });
		await vi.advanceTimersByTimeAsync(60 * MINUTE);
		expect(onUnhealthy).not.toHaveBeenCalled();
	});

	it("rides out a brief outage that recovers", async () => {
		let down = true;
		const onUnhealthy = vi.fn();
		stop = startDbWatchdog({
			probes: {
				app: async () => {
					if (down) throw new Error("connection refused");
				},
			},
			onUnhealthy,
		});
		await vi.advanceTimersByTimeAsync(2 * MINUTE);
		down = false;
		await vi.advanceTimersByTimeAsync(60 * MINUTE);
		expect(onUnhealthy).not.toHaveBeenCalled();
	});

	it("reports a pool that stays unreachable, once", async () => {
		const failure = new Error("timeout exceeded when trying to connect");
		const onUnhealthy = vi.fn();
		stop = startDbWatchdog({
			probes: {
				app: async () => {
					throw failure;
				},
			},
			onUnhealthy,
		});
		await vi.advanceTimersByTimeAsync(4 * MINUTE);
		expect(onUnhealthy).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(2 * MINUTE);
		await vi.advanceTimersByTimeAsync(30 * MINUTE);
		expect(onUnhealthy).toHaveBeenCalledTimes(1);
		expect(onUnhealthy).toHaveBeenCalledWith("app", failure);
	});

	it("treats a probe that never settles as a failure", async () => {
		const onUnhealthy = vi.fn();
		stop = startDbWatchdog({ probes: { boss: () => new Promise(() => {}) }, onUnhealthy });
		await vi.advanceTimersByTimeAsync(10 * MINUTE);
		expect(onUnhealthy).toHaveBeenCalledWith("boss", expect.any(Error));
	});

	it("reports the failing pool even while another stays healthy", async () => {
		const onUnhealthy = vi.fn();
		stop = startDbWatchdog({
			probes: {
				app: async () => {},
				boss: async () => {
					throw new Error("timeout exceeded when trying to connect");
				},
			},
			onUnhealthy,
		});
		await vi.advanceTimersByTimeAsync(10 * MINUTE);
		expect(onUnhealthy).toHaveBeenCalledTimes(1);
		expect(onUnhealthy).toHaveBeenCalledWith("boss", expect.any(Error));
	});

	it("stops probing once stopped", async () => {
		const probe = vi.fn(async () => {});
		startDbWatchdog({ probes: { app: probe }, onUnhealthy: vi.fn() })();
		await vi.advanceTimersByTimeAsync(10 * MINUTE);
		expect(probe).not.toHaveBeenCalled();
	});
});
