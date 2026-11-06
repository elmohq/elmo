import { describe, expect, it } from "vitest";
import { adminNavItems } from "@/lib/admin-nav";

const asPairs = (items: ReturnType<typeof adminNavItems>) =>
	items.map((item) => [item.title, item.link.to]);

describe("adminNavItems", () => {
	it("shows an admin Brands, Reports, Workflows and Tools, in that order", () => {
		expect(
			asPairs(adminNavItems({ isAdmin: true, hasReportAccess: false, reportsEnabled: true })),
		).toEqual([
			["Brands", "/admin"],
			["Reports", "/reports"],
			["Workflows", "/admin/workflows"],
			["Tools", "/admin/tools"],
		]);
	});

	it("hides Reports from an admin when reports are turned off, keeping the rest in order", () => {
		expect(
			asPairs(adminNavItems({ isAdmin: true, hasReportAccess: false, reportsEnabled: false })),
		).toEqual([
			["Brands", "/admin"],
			["Workflows", "/admin/workflows"],
			["Tools", "/admin/tools"],
		]);
	});

	it("never needs hasReportAccess for an admin to see Reports", () => {
		expect(
			asPairs(adminNavItems({ isAdmin: true, hasReportAccess: true, reportsEnabled: true })),
		).toEqual([
			["Brands", "/admin"],
			["Reports", "/reports"],
			["Workflows", "/admin/workflows"],
			["Tools", "/admin/tools"],
		]);
		expect(
			adminNavItems({ isAdmin: true, hasReportAccess: true, reportsEnabled: false }),
		).not.toContainEqual(expect.objectContaining({ title: "Reports" }));
	});

	it("shows a non-admin with report access only Reports, when reports are enabled", () => {
		expect(
			asPairs(adminNavItems({ isAdmin: false, hasReportAccess: true, reportsEnabled: true })),
		).toEqual([["Reports", "/reports"]]);
	});

	it("shows a non-admin nothing when reports are off", () => {
		expect(
			adminNavItems({ isAdmin: false, hasReportAccess: true, reportsEnabled: false }),
		).toEqual([]);
	});

	it("shows a non-admin nothing without report access, even when reports are on", () => {
		expect(
			adminNavItems({ isAdmin: false, hasReportAccess: false, reportsEnabled: true }),
		).toEqual([]);
	});

	it("never shows a non-admin an /admin link", () => {
		for (const hasReportAccess of [true, false]) {
			for (const reportsEnabled of [true, false]) {
				const items = adminNavItems({ isAdmin: false, hasReportAccess, reportsEnabled });
				for (const item of items) {
					expect(item.link.to.startsWith("/admin")).toBe(false);
				}
			}
		}
	});
});
