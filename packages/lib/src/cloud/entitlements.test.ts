import { describe, expect, it, vi } from "vitest";
import type { OrganizationBillingSnapshotStore } from "./entitlements";
import { resolveOrganizationEntitlements } from "./entitlements";

describe("resolveOrganizationEntitlements", () => {
	it.each(["local", "demo", "whitelabel"] as const)("does not read billing state in %s mode", async (mode) => {
		const store: OrganizationBillingSnapshotStore = { load: vi.fn().mockRejectedValue(new Error("must not run")) };
		const result = await resolveOrganizationEntitlements({ mode, organizationId: "org-a", store });

		expect(store.load).not.toHaveBeenCalled();
		expect(result).toMatchObject({ mode, access: "allowed", source: { kind: "legacy" } });
	});

	it("fails cloud closed when no billing projection exists", async () => {
		const store: OrganizationBillingSnapshotStore = { load: vi.fn().mockResolvedValue(null) };
		const result = await resolveOrganizationEntitlements({ mode: "cloud", organizationId: "org-a", store });

		expect(result).toMatchObject({ mode: "cloud", access: "denied", reason: "missing-subscription" });
	});

	it("resolves the projected plan, add-on quantity, and custom revision through the pure resolver", async () => {
		const store: OrganizationBillingSnapshotStore = {
			load: vi.fn().mockResolvedValue({
				planId: "pro",
				status: "active",
				claudeAddonPromptSlots: 7,
			}),
		};
		const result = await resolveOrganizationEntitlements({ mode: "cloud", organizationId: "org-a", store });

		expect(store.load).toHaveBeenCalledWith("org-a", expect.any(Date));
		expect(result).toMatchObject({
			access: "allowed",
			source: { kind: "catalog", planId: "pro" },
			entitlements: { brandSlots: 2, promptSlots: 150, claudeTracking: { totalPromptSlots: 27 } },
		});
	});
});
