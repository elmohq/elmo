import { describe, expect, it } from "vitest";
import {
	cloudBillingPath,
	isProjectedCloudSubscriptionActive,
	maximumSelectedTargets,
	resolveNewBrandWorkspace,
} from "../cloud-billing-ui";

describe("cloud billing UI decisions", () => {
	it("preserves the legacy organization-without-brand flow", () => {
		expect(
			resolveNewBrandWorkspace({
				mode: "whitelabel",
				organizationIds: ["customer"],
				requestedOrganizationId: "customer",
			}),
		).toEqual({ kind: "legacy", organizationId: "customer" });
	});

	it("requires an active projected subscription before cloud brand creation", () => {
		expect(
			resolveNewBrandWorkspace({ mode: "cloud", organizationIds: ["org"], activeCloudOrganizationIds: new Set() }),
		).toEqual({ kind: "billing", organizationId: "org" });
		expect(
			resolveNewBrandWorkspace({
				mode: "cloud",
				organizationIds: ["org"],
				activeCloudOrganizationIds: new Set(["org"]),
			}),
		).toEqual({ kind: "create", organizationId: "org" });
	});

	it("requires an explicit choice for multiple cloud workspaces", () => {
		expect(resolveNewBrandWorkspace({ mode: "cloud", organizationIds: ["one", "two"] })).toEqual({
			kind: "choose-workspace",
		});
		expect(() =>
			resolveNewBrandWorkspace({
				mode: "cloud",
				organizationIds: ["one"],
				requestedOrganizationId: "other",
			}),
		).toThrow(/Forbidden/);
	});

	it("builds encoded checkout return paths and usage summaries", () => {
		expect(cloudBillingPath("org/one", { checkout: "success", returnTo: "/app/new?organization=org/one" })).toBe(
			"/app/workspaces/org%2Fone/billing?checkout=success&returnTo=%2Fapp%2Fnew%3Forganization%3Dorg%2Fone",
		);
		expect(isProjectedCloudSubscriptionActive({ status: "active" })).toBe(true);
		expect(isProjectedCloudSubscriptionActive({ status: "trialing" })).toBe(false);
		expect(maximumSelectedTargets([{ targetKeys: ["one"] }, { targetKeys: ["one", "two"] }])).toBe(2);
	});
});
