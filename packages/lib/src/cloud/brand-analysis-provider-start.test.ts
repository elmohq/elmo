import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	withEntitlements: vi.fn(),
	assertEnabledBrandCapacity: vi.fn(),
}));

vi.mock("../db/db", () => ({ db: {} }));
vi.mock("./capacity", () => ({
	withOrganizationEntitlementTransaction: mocks.withEntitlements,
	assertEnabledBrandCapacity: mocks.assertEnabledBrandCapacity,
}));

import {
	beginCloudBrandAnalysisProviderCall,
	type CloudBrandAnalysisJobData,
	cloudBrandAnalysisRequestFingerprint,
} from "./brand-analysis-admission";

const jobId = "11111111-1111-4111-8111-111111111111";
const brand = { id: "acme", name: "Acme", website: "acme.test", enabled: true };
const data: CloudBrandAnalysisJobData = {
	version: 2,
	organizationId: "org-1",
	brandId: brand.id,
	admissionGeneration: 1,
	requestFingerprint: cloudBrandAnalysisRequestFingerprint({
		brandId: brand.id,
		brandName: brand.name,
		website: brand.website,
	}),
};

function transaction(
	authoritativeBrand: typeof brand | null = brand,
	updateResult: unknown[] = [{ brandId: brand.id }],
) {
	const returning = vi.fn(async () => updateResult);
	const updateWhere = vi.fn(() => ({ returning }));
	const set = vi.fn(() => ({ where: updateWhere }));
	const update = vi.fn(() => ({ set }));
	const forUpdate = vi.fn(async () => (authoritativeBrand ? [authoritativeBrand] : []));
	const select = vi.fn(() => ({
		from: () => ({
			where: () => ({
				limit: () => ({ for: forUpdate }),
			}),
		}),
	}));
	return { tx: { select, update }, update, set, updateWhere, returning, forUpdate };
}

describe("cloud brand-analysis provider-start fence", () => {
	beforeEach(() => vi.clearAllMocks());

	it("consumes the exact pending admission under current cloud entitlements", async () => {
		const fake = transaction();
		mocks.withEntitlements.mockImplementation(async ({ run }) =>
			run({ tx: fake.tx, resolved: { mode: "cloud", access: "allowed" } }),
		);

		await expect(beginCloudBrandAnalysisProviderCall({ jobId, data })).resolves.toEqual({
			website: brand.website,
			brandName: brand.name,
		});
		expect(mocks.withEntitlements).toHaveBeenCalledWith(
			expect.objectContaining({ mode: "cloud", organizationId: "org-1" }),
		);
		expect(mocks.assertEnabledBrandCapacity).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }));
		expect(fake.update).toHaveBeenCalledOnce();
		expect(fake.set).toHaveBeenCalledWith(
			expect.objectContaining({ status: "running", providerStartedAt: expect.any(Date) }),
		);
	});

	it("does not authorize stale authoritative brand inputs", async () => {
		const fake = transaction({ ...brand, website: "changed.test" });
		mocks.withEntitlements.mockImplementation(async ({ run }) =>
			run({ tx: fake.tx, resolved: { mode: "cloud", access: "allowed" } }),
		);

		await expect(beginCloudBrandAnalysisProviderCall({ jobId, data })).resolves.toBeNull();
		expect(fake.update).not.toHaveBeenCalled();
	});

	it("does not authorize a disabled brand or a missing pending row", async () => {
		const disabled = transaction({ ...brand, enabled: false });
		mocks.withEntitlements.mockImplementationOnce(async ({ run }) =>
			run({ tx: disabled.tx, resolved: { mode: "cloud", access: "allowed" } }),
		);
		await expect(beginCloudBrandAnalysisProviderCall({ jobId, data })).resolves.toBeNull();
		expect(disabled.update).not.toHaveBeenCalled();

		const missing = transaction(brand, []);
		mocks.withEntitlements.mockImplementationOnce(async ({ run }) =>
			run({ tx: missing.tx, resolved: { mode: "cloud", access: "allowed" } }),
		);
		await expect(beginCloudBrandAnalysisProviderCall({ jobId, data })).resolves.toBeNull();
	});

	it("does not return customer inputs after retention deletes the brand", async () => {
		const deleted = transaction(null, []);
		mocks.withEntitlements.mockImplementationOnce(async ({ run }) =>
			run({ tx: deleted.tx, resolved: { mode: "cloud", access: "allowed" } }),
		);

		await expect(beginCloudBrandAnalysisProviderCall({ jobId, data })).resolves.toBeNull();
		expect(deleted.update).not.toHaveBeenCalled();
	});

	it("does not consume an admission after a downgrade leaves the organization over capacity", async () => {
		const fake = transaction();
		mocks.withEntitlements.mockImplementation(async ({ run }) =>
			run({ tx: fake.tx, resolved: { mode: "cloud", access: "allowed" } }),
		);
		mocks.assertEnabledBrandCapacity.mockRejectedValueOnce(new Error("brand capacity exceeded"));

		await expect(beginCloudBrandAnalysisProviderCall({ jobId, data })).rejects.toThrow("brand capacity exceeded");
		expect(fake.update).not.toHaveBeenCalled();
	});
});
