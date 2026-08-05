import { describe, expect, it } from "vitest";
import { decideCloudBillingProjectionReplacement, nextCloudBillingDelinquentSince } from "./billing-store";

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

	it("does not let a terminal overlap revoke a subscription in its payment grace period", () => {
		expect(
			decideCloudBillingProjectionReplacement(
				{ ...current, status: "past_due" },
				{
					stripeSubscriptionId: "sub_terminal",
					status: "canceled",
					sourceEventCreatedAt: new Date("2026-08-05T00:00:03Z"),
				},
			),
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

	it.each([
		["active", "past_due"],
		["past_due", "active"],
		["past_due", "past_due"],
	])("surfaces overlapping access-granting subscriptions in %s and %s", (currentStatus, candidateStatus) => {
		expect(
			decideCloudBillingProjectionReplacement(
				{ ...current, status: currentStatus },
				{
					stripeSubscriptionId: "sub_other",
					status: candidateStatus,
					sourceEventCreatedAt: new Date("2026-08-05T00:00:03Z"),
				},
			),
		).toBe("conflict");
	});

	it("does not treat an unexpected trial as paid access", () => {
		expect(
			decideCloudBillingProjectionReplacement(
				{ ...current, status: "trialing" },
				{
					stripeSubscriptionId: "sub_paid",
					status: "active",
					sourceEventCreatedAt: new Date("2026-08-05T00:00:03Z"),
				},
			),
		).toBe("apply");
	});
});

describe("cloud billing delinquency transitions", () => {
	const firstPastDueAt = new Date("2026-08-05T00:00:03Z");

	it("starts delinquency at the first past-due source event", () => {
		expect(nextCloudBillingDelinquentSince(null, { status: "past_due", sourceEventCreatedAt: firstPastDueAt })).toEqual(
			firstPastDueAt,
		);
	});

	it("preserves the original delinquency boundary across later past-due events", () => {
		expect(
			nextCloudBillingDelinquentSince(firstPastDueAt, {
				status: "past_due",
				sourceEventCreatedAt: new Date("2026-08-06T00:00:03Z"),
			}),
		).toEqual(firstPastDueAt);
	});

	it.each(["active", "trialing", "unpaid", "canceled"])("clears delinquency when status becomes %s", (status) => {
		expect(nextCloudBillingDelinquentSince(firstPastDueAt, { status, sourceEventCreatedAt: new Date() })).toBeNull();
	});
});
