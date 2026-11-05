import { describe, expect, it } from "vitest";
import type { subscription } from "../db/schema";
import { selectRelevantSubscription } from "./service";

type Row = typeof subscription.$inferSelect;

function row(partial: Partial<Row> & { id: string }): Row {
	return {
		plan: "pro",
		referenceId: "org-1",
		stripeCustomerId: null,
		stripeSubscriptionId: null,
		status: "active",
		periodStart: null,
		periodEnd: null,
		trialStart: null,
		trialEnd: null,
		cancelAtPeriodEnd: null,
		cancelAt: null,
		canceledAt: null,
		endedAt: null,
		seats: null,
		billingInterval: null,
		stripeScheduleId: null,
		...partial,
	} as Row;
}

describe("selectRelevantSubscription", () => {
	it("returns null for no rows", () => {
		expect(selectRelevantSubscription([])).toBeNull();
	});

	it("prefers an active row over a canceled one (resubscribe case)", () => {
		const canceled = row({ id: "old", status: "canceled", periodEnd: new Date("2026-09-01") });
		const active = row({ id: "new", status: "active", periodEnd: new Date("2026-08-15") });
		expect(selectRelevantSubscription([canceled, active])?.id).toBe("new");
	});

	it("prefers past_due over canceled but active over past_due", () => {
		const pastDue = row({ id: "pd", status: "past_due" });
		const canceled = row({ id: "c", status: "canceled" });
		expect(selectRelevantSubscription([canceled, pastDue])?.id).toBe("pd");
		const active = row({ id: "a", status: "active" });
		expect(selectRelevantSubscription([pastDue, active, canceled])?.id).toBe("a");
	});

	it("breaks status ties by the latest billing period", () => {
		const older = row({ id: "older", status: "canceled", periodEnd: new Date("2026-01-01") });
		const newer = row({ id: "newer", status: "canceled", periodEnd: new Date("2026-06-01") });
		expect(selectRelevantSubscription([older, newer])?.id).toBe("newer");
	});

	it("ranks unknown statuses last", () => {
		const weird = row({ id: "w", status: "some_future_status" });
		const canceled = row({ id: "c", status: "canceled" });
		expect(selectRelevantSubscription([weird, canceled])?.id).toBe("c");
	});

	it("does not mutate the input array", () => {
		const rows = [row({ id: "b", status: "canceled" }), row({ id: "a", status: "active" })];
		selectRelevantSubscription(rows);
		expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
	});
});
