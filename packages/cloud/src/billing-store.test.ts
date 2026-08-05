import { describe, expect, it } from "vitest";
import { decideCloudBillingProjectionReplacement } from "./billing-store";

const current = {
	stripeSubscriptionId: "sub_current",
	status: "active",
	sourceEventCreatedAt: new Date("2026-08-05T00:00:02Z"),
};

describe("cloud billing projection ordering", () => {
	it("always reapplies a freshly retrieved snapshot for the same subscription", () => {
		expect(
			decideCloudBillingProjectionReplacement(current, {
				stripeSubscriptionId: "sub_current",
				status: "canceled",
				sourceEventCreatedAt: new Date("2026-08-05T00:00:01Z"),
			}),
		).toBe("apply");
	});

	it("ignores an older event for a different subscription", () => {
		expect(
			decideCloudBillingProjectionReplacement(current, {
				stripeSubscriptionId: "sub_old",
				status: "canceled",
				sourceEventCreatedAt: new Date("2026-08-05T00:00:01Z"),
			}),
		).toBe("ignore");
	});

	it("does not let deletion of an old subscription revoke a newer active one", () => {
		expect(
			decideCloudBillingProjectionReplacement(current, {
				stripeSubscriptionId: "sub_old",
				status: "canceled",
				sourceEventCreatedAt: new Date("2026-08-05T00:00:03Z"),
			}),
		).toBe("ignore");
	});

	it("surfaces two simultaneous active subscriptions instead of choosing silently", () => {
		expect(
			decideCloudBillingProjectionReplacement(current, {
				stripeSubscriptionId: "sub_other",
				status: "active",
				sourceEventCreatedAt: new Date("2026-08-05T00:00:03Z"),
			}),
		).toBe("conflict");
	});
});
