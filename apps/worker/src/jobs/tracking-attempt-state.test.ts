import { describe, expect, it } from "vitest";
import { getAttemptRecoveryDisposition } from "./tracking-attempt-state";

describe("tracking attempt recovery", () => {
	it.each(["reserved", "started"] as const)("retries later while a %s attempt still has a live claim", (status) => {
		expect(getAttemptRecoveryDisposition(status, false)).toBe("retry-later");
	});

	it("releases quota only when provider I/O definitely never started", () => {
		expect(getAttemptRecoveryDisposition("reserved", true)).toBe("release-reservation");
	});

	it("retains quota for ambiguous started calls", () => {
		expect(getAttemptRecoveryDisposition("started", true)).toBe("retain-charge");
	});

	it.each(["succeeded", "failed", "canceled"] as const)("does not recover terminal %s attempts", (status) => {
		expect(getAttemptRecoveryDisposition(status, true)).toBe("terminal");
	});
});
