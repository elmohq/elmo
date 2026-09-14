import { describe, expect, it } from "vitest";
import { dunningNoticeForStatusChange } from "./dunning";

describe("dunningNoticeForStatusChange", () => {
	it("maps entering past_due to a payment-failed notice", () => {
		expect(dunningNoticeForStatusChange("active", "past_due")).toBe("payment-failed");
		expect(dunningNoticeForStatusChange("trialing", "past_due")).toBe("payment-failed");
	});

	it("maps recovery to active to a payment-recovered notice", () => {
		expect(dunningNoticeForStatusChange("past_due", "active")).toBe("payment-recovered");
		expect(dunningNoticeForStatusChange("unpaid", "active")).toBe("payment-recovered");
	});

	it("maps exhausted retries marked unpaid to a subscription-ended notice", () => {
		expect(dunningNoticeForStatusChange("past_due", "unpaid")).toBe("subscription-ended");
	});

	it("sends nothing when the status did not change", () => {
		expect(dunningNoticeForStatusChange(undefined, "past_due")).toBeNull();
		expect(dunningNoticeForStatusChange("past_due", "past_due")).toBeNull();
	});

	it("sends nothing for activations that are not payment recoveries", () => {
		expect(dunningNoticeForStatusChange("incomplete", "active")).toBeNull();
		expect(dunningNoticeForStatusChange("trialing", "active")).toBeNull();
	});
});
