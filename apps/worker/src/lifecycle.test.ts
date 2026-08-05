import { describe, expect, it, vi } from "vitest";
import { drainWorkerGracefully } from "./lifecycle";

describe("worker graceful shutdown", () => {
	it("drains jobs and observability before the caller exits the fenced process", async () => {
		const calls: string[] = [];
		await drainWorkerGracefully({
			drainJobs: vi.fn(async () => {
				calls.push("drain-jobs");
			}),
			removeReadiness: vi.fn(async () => {
				calls.push("remove-ready");
			}),
			shutdownObservability: vi.fn(async () => {
				calls.push("shutdown-observability");
			}),
		});

		expect(calls).toEqual(["remove-ready", "drain-jobs", "shutdown-observability"]);
	});

	it("never releases the fence when the job drain fails", async () => {
		const calls: string[] = [];
		const drainFailure = new Error("pg-boss drain failed");
		await expect(
			drainWorkerGracefully({
				drainJobs: vi.fn(async () => {
					calls.push("drain-jobs");
					throw drainFailure;
				}),
				removeReadiness: vi.fn(async () => {
					calls.push("remove-ready");
				}),
				shutdownObservability: vi.fn(async () => {
					calls.push("shutdown-observability");
				}),
			}),
		).rejects.toBe(drainFailure);
		expect(calls).toEqual(["remove-ready", "drain-jobs"]);
	});
});
