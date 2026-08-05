import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDeployment: vi.fn(),
	requireAuthSession: vi.fn(),
	requireBrandAccess: vi.fn(),
	requireBrandOrganization: vi.fn(),
	requireOrgAccess: vi.fn(),
	listUserOrganizations: vi.fn(),
	updateOrganizationBrand: vi.fn(),
	replaceOrganizationCompetitors: vi.fn(),
	addOrganizationBrandDomain: vi.fn(),
	addOrganizationCompetitorDomain: vi.fn(),
	createOrganizationCompetitor: vi.fn(),
	createOrganizationBrand: vi.fn(),
	dbUpdate: vi.fn(),
	dbTransaction: vi.fn(),
	dbSelect: vi.fn(),
	dbInsert: vi.fn(),
}));

vi.mock("@/lib/config/server", () => ({ getDeployment: mocks.getDeployment }));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		const builder = {
			validator: vi.fn(),
			handler: vi.fn(),
		};
		builder.validator.mockReturnValue(builder);
		builder.handler.mockImplementation((handler) => handler);
		return builder;
	},
}));
vi.mock("@/lib/auth/helpers", () => ({
	listUserOrganizations: mocks.listUserOrganizations,
	requireAuthSession: mocks.requireAuthSession,
	requireBrandAccess: mocks.requireBrandAccess,
	requireBrandOrganization: mocks.requireBrandOrganization,
	requireOrgAccess: mocks.requireOrgAccess,
}));
vi.mock("@workspace/lib/cloud/api-resources", () => ({
	addOrganizationBrandDomain: mocks.addOrganizationBrandDomain,
	addOrganizationCompetitorDomain: mocks.addOrganizationCompetitorDomain,
	createOrganizationCompetitor: mocks.createOrganizationCompetitor,
	replaceOrganizationCompetitors: mocks.replaceOrganizationCompetitors,
	updateOrganizationBrand: mocks.updateOrganizationBrand,
}));
vi.mock("@workspace/lib/cloud/capacity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@workspace/lib/cloud/capacity")>()),
	createOrganizationBrand: mocks.createOrganizationBrand,
}));
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		update: mocks.dbUpdate,
		transaction: mocks.dbTransaction,
		select: mocks.dbSelect,
		insert: mocks.dbInsert,
		query: {
			brands: { findFirst: vi.fn() },
			competitors: { findFirst: vi.fn(), findMany: vi.fn() },
			prompts: { findMany: vi.fn() },
		},
	},
}));

import { EntitlementAccessError } from "@workspace/lib/cloud/capacity";
import {
	addDomainToBrandFn,
	addDomainToCompetitorFn,
	createCompetitorFromDomainFn,
	updateBrandFn,
	updateCompetitors,
} from "./brands";

function updateBuilder(rows: unknown[]) {
	const builder = {
		set: vi.fn(),
		where: vi.fn(),
		returning: vi.fn(async () => rows),
	};
	builder.set.mockReturnValue(builder);
	builder.where.mockReturnValue(builder);
	return builder;
}

describe("authenticated cloud brand mutations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDeployment.mockReturnValue({ mode: "cloud" });
		mocks.requireAuthSession.mockResolvedValue({ user: { id: "user-a" } });
		mocks.requireBrandOrganization.mockResolvedValue({ id: "org-a", name: "Org A", role: "member" });
		for (const mutation of [
			mocks.updateOrganizationBrand,
			mocks.replaceOrganizationCompetitors,
			mocks.addOrganizationBrandDomain,
			mocks.addOrganizationCompetitorDomain,
			mocks.createOrganizationCompetitor,
		]) {
			mutation.mockResolvedValue({ id: "result" });
		}
	});

	it("derives tenancy from membership and sends every existing-resource write through the organization boundary", async () => {
		await updateBrandFn({ data: { brandId: "brand-a", name: " Brand A ", enabled: false } });
		await updateCompetitors({
			data: {
				brandId: "brand-a",
				competitors: [{ name: "Competitor", domains: ["https://competitor.example/path"], aliases: [] }],
			},
		});
		await addDomainToBrandFn({ data: { brandId: "brand-a", domain: "https://shop.brand.example/path" } });
		await addDomainToCompetitorFn({
			data: {
				brandId: "brand-a",
				competitorId: "competitor-a",
				domain: "new.competitor.example",
			},
		});
		await createCompetitorFromDomainFn({
			data: {
				brandId: "brand-a",
				name: " Competitor B ",
				domain: "competitor-b.example",
			},
		});

		expect(mocks.updateOrganizationBrand).toHaveBeenCalledWith({
			organizationId: "org-a",
			brandId: "brand-a",
			name: "Brand A",
			enabled: false,
		});
		expect(mocks.replaceOrganizationCompetitors).toHaveBeenCalledWith({
			organizationId: "org-a",
			brandId: "brand-a",
			competitors: [{ name: "Competitor", domains: ["competitor.example"], aliases: [] }],
		});
		expect(mocks.addOrganizationBrandDomain).toHaveBeenCalledWith({
			organizationId: "org-a",
			brandId: "brand-a",
			domain: "shop.brand.example",
		});
		expect(mocks.addOrganizationCompetitorDomain).toHaveBeenCalledWith({
			organizationId: "org-a",
			brandId: "brand-a",
			competitorId: "competitor-a",
			domain: "new.competitor.example",
		});
		expect(mocks.createOrganizationCompetitor).toHaveBeenCalledWith({
			organizationId: "org-a",
			brandId: "brand-a",
			name: "Competitor B",
			domains: ["competitor-b.example"],
			aliases: [],
		});
		expect(mocks.requireBrandOrganization).toHaveBeenCalledTimes(5);
		expect(mocks.requireBrandAccess).not.toHaveBeenCalled();
		expect(mocks.dbUpdate).not.toHaveBeenCalled();
		expect(mocks.dbTransaction).not.toHaveBeenCalled();
		expect(mocks.dbInsert).not.toHaveBeenCalled();
	});

	it("stops before persistence when membership cannot resolve the owning organization", async () => {
		mocks.requireBrandOrganization.mockRejectedValue(new Error("Forbidden: No access to this brand"));

		await expect(
			updateCompetitors({
				data: {
					brandId: "brand-b",
					competitors: [{ name: "Other", domains: ["other.example"], aliases: [] }],
				},
			}),
		).rejects.toThrow("Forbidden: No access to this brand");
		expect(mocks.replaceOrganizationCompetitors).not.toHaveBeenCalled();
		expect(mocks.dbTransaction).not.toHaveBeenCalled();
	});

	it("surfaces entitlement denial from the locked organization boundary", async () => {
		mocks.updateOrganizationBrand.mockRejectedValue(new EntitlementAccessError("subscription inactive"));

		await expect(updateBrandFn({ data: { brandId: "brand-a", name: "Brand A" } })).rejects.toThrow(
			"subscription inactive",
		);
		expect(mocks.dbUpdate).not.toHaveBeenCalled();
	});
});

describe("authenticated noncloud brand mutations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuthSession.mockResolvedValue({ user: { id: "user-a" } });
		mocks.requireBrandAccess.mockResolvedValue(undefined);
	});

	it.each(["local", "whitelabel"])("keeps the existing direct %s brand update path", async (mode) => {
		mocks.getDeployment.mockReturnValue({ mode });
		const updated = { id: "brand-a", name: "Brand A" };
		mocks.dbUpdate.mockReturnValue(updateBuilder([updated]));

		await expect(updateBrandFn({ data: { brandId: "brand-a", name: " Brand A " } })).resolves.toEqual(updated);

		expect(mocks.requireBrandAccess).toHaveBeenCalledWith("user-a", "brand-a");
		expect(mocks.requireBrandOrganization).not.toHaveBeenCalled();
		expect(mocks.updateOrganizationBrand).not.toHaveBeenCalled();
		expect(mocks.dbUpdate).toHaveBeenCalledOnce();
	});

	it("keeps whitelabel competitor replacement on its existing local transaction path", async () => {
		mocks.getDeployment.mockReturnValue({ mode: "whitelabel" });
		const stored = [{ id: "competitor-a", brandId: "brand-a", domains: ["competitor.example"] }];
		const tx = {
			delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
			insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
			query: { competitors: { findMany: vi.fn().mockResolvedValue(stored) } },
		};
		mocks.dbTransaction.mockImplementation(async (run: (transaction: typeof tx) => unknown) => run(tx));

		await expect(
			updateCompetitors({
				data: {
					brandId: "brand-a",
					competitors: [{ name: "Competitor", domains: ["https://competitor.example/path"], aliases: ["Rival"] }],
				},
			}),
		).resolves.toEqual(stored);

		expect(mocks.requireBrandAccess).toHaveBeenCalledWith("user-a", "brand-a");
		expect(mocks.requireBrandOrganization).not.toHaveBeenCalled();
		expect(mocks.replaceOrganizationCompetitors).not.toHaveBeenCalled();
		expect(mocks.dbTransaction).toHaveBeenCalledOnce();
		expect(tx.delete).toHaveBeenCalledOnce();
		expect(tx.insert).toHaveBeenCalledOnce();
	});
});
