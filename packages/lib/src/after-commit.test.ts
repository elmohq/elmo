import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAfterCommit } from "./after-commit";

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("runAfterCommit", () => {
	it("awaits the task", async () => {
		let ran = false;
		await runAfterCommit(async () => {
			await Promise.resolve();
			ran = true;
		});
		expect(ran).toBe(true);
	});

	it("absorbs a failing task rather than failing the write it follows", async () => {
		await expect(
			runAfterCommit(async () => {
				throw new Error("queue unreachable");
			}),
		).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});

	it("absorbs a task that throws synchronously", async () => {
		await expect(
			runAfterCommit((() => {
				throw new Error("boom");
			}) as () => Promise<unknown>),
		).resolves.toBeUndefined();
	});
});
