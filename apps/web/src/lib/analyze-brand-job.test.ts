import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	withEntitlements: vi.fn(),
	assertEnabledBrandCapacity: vi.fn(),
	getBoss: vi.fn(),
}));

vi.mock("@workspace/lib/cloud/capacity", () => ({
	withOrganizationEntitlementTransaction: mocks.withEntitlements,
	assertEnabledBrandCapacity: mocks.assertEnabledBrandCapacity,
}));
vi.mock("@workspace/lib/cloud/advisory-locks", () => ({ lockOrganizationCapacity: vi.fn() }));
vi.mock("@workspace/lib/db/db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("@/lib/boss-client", () => ({ getBoss: mocks.getBoss }));

import { CLOUD_BRAND_ANALYSIS_QUEUE } from "@workspace/lib/cloud/brand-analysis-admission";
import { enqueueCloudAnalyzeBrand } from "./analyze-brand-job";

const brand = { id: "acme", organizationId: "org-1", name: "Acme", website: "acme.test", enabled: true };

function admissionTransaction(staged: unknown[]) {
	let selectCount = 0;
	return {
		select: () => {
			const rows = selectCount++ === 0 ? [brand] : [];
			return {
				from: () => ({
					where: () => ({
						limit: () => ({ for: async () => rows }),
					}),
				}),
			};
		},
		insert: () => ({
			values: async (value: unknown) => {
				staged.push(value);
			},
		}),
		execute: vi.fn(),
	};
}

describe("cloud brand-analysis coordinator", () => {
	let persisted: unknown[];
	let send: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		persisted = [];
		send = vi.fn(async (_queue: string, _data: unknown, options: { id: string }) => options.id);
		mocks.getBoss.mockResolvedValue({ send });
		mocks.withEntitlements.mockImplementation(async ({ run }) => {
			const staged: unknown[] = [];
			const result = await run({
				tx: admissionTransaction(staged),
				resolved: { mode: "cloud", access: "allowed" },
			});
			persisted = staged;
			return result;
		});
	});

	it("atomically persists one admission and a zero-retry versioned queue job", async () => {
		await enqueueCloudAnalyzeBrand({ organizationId: "org-1", brandId: "acme" });

		expect(mocks.withEntitlements).toHaveBeenCalledWith(
			expect.objectContaining({ mode: "cloud", organizationId: "org-1" }),
		);
		expect(mocks.assertEnabledBrandCapacity).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }));
		expect(persisted).toHaveLength(1);
		const admission = persisted[0] as Record<string, unknown>;
		const [queue, data, options] = send.mock.calls[0] as [
			string,
			Record<string, unknown>,
			{ id: string; retryLimit: number; db: { executeSql: unknown } },
		];
		expect(queue).toBe(CLOUD_BRAND_ANALYSIS_QUEUE);
		expect(data).toMatchObject({
			version: 1,
			organizationId: "org-1",
			brandId: "acme",
			website: "acme.test",
			brandName: "Acme",
			admissionGeneration: 1,
		});
		expect(options.retryLimit).toBe(0);
		expect(options.id).toBe(admission.jobId);
		expect(data.requestFingerprint).toBe(admission.requestFingerprint);
		expect(options.db.executeSql).toBeTypeOf("function");
	});

	it("does not commit the admission when pg-boss refuses the matching job", async () => {
		send.mockResolvedValue(null);
		await expect(enqueueCloudAnalyzeBrand({ organizationId: "org-1", brandId: "acme" })).rejects.toThrow(
			"Failed to enqueue",
		);
		expect(persisted).toEqual([]);
	});

	it("does not admit paid analysis while the organization is above its brand capacity", async () => {
		mocks.assertEnabledBrandCapacity.mockRejectedValueOnce(new Error("brand capacity exceeded"));

		await expect(enqueueCloudAnalyzeBrand({ organizationId: "org-1", brandId: "acme" })).rejects.toThrow(
			"brand capacity exceeded",
		);
		expect(send).not.toHaveBeenCalled();
		expect(persisted).toEqual([]);
	});
});
