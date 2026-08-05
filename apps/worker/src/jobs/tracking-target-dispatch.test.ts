import { describe, expect, it } from "vitest";
import { trackingTargetDispatchDisposition } from "./tracking-target-dispatch";

describe("tracking target dispatch", () => {
	it("quarantines schedules that the deployed worker cannot execute", () => {
		expect(trackingTargetDispatchDisposition(new Set(["chatgpt"]), "contract-only-target")).toBe("quarantine");
	});

	it("dispatches a configured logical target", () => {
		expect(trackingTargetDispatchDisposition(new Set(["chatgpt"]), "chatgpt")).toBe("dispatch");
	});
});
