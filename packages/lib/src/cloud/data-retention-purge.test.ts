import { describe, expect, it, vi } from "vitest";
import {
	apikey,
	brandAnalysisAdmissions,
	brandOpportunities,
	brandSchedulerRollouts,
	brands,
	brandTargetSelections,
	citations,
	competitors,
	promptRuns,
	prompts,
	promptTargetAssignments,
	reports,
	trackingOccurrences,
	trackingProviderAttempts,
	trackingSchedules,
	trackingTasks,
} from "../db/schema";
import {
	buildRetainedProviderAttemptUpdate,
	purgeCloudOrganizationProductDataInTransaction,
} from "./data-retention-purge";

describe("cloud organization product purge", () => {
	function transaction(brandIds: string[]) {
		const order: string[] = [];
		const deleteDefinitions = new Map<unknown, { label: string; count: number }>([
			[apikey, { label: "apiKeys", count: 1 }],
			[reports, { label: "reports", count: 2 }],
			[citations, { label: "citations", count: 3 }],
			[brandOpportunities, { label: "opportunityReports", count: 4 }],
			[competitors, { label: "competitors", count: 5 }],
			[trackingTasks, { label: "trackingTasks", count: 6 }],
			[trackingOccurrences, { label: "trackingOccurrences", count: 7 }],
			[trackingSchedules, { label: "trackingSchedules", count: 8 }],
			[promptTargetAssignments, { label: "promptTargetAssignments", count: 9 }],
			[brandTargetSelections, { label: "brandTargetSelections", count: 10 }],
			[brandSchedulerRollouts, { label: "brandSchedulerRollouts", count: 11 }],
			[promptRuns, { label: "promptRuns", count: 12 }],
			[brandAnalysisAdmissions, { label: "brandAnalysisAdmissions", count: 13 }],
			[prompts, { label: "prompts", count: 14 }],
			[brands, { label: "brands", count: 15 }],
		]);
		const attemptUpdate = vi.fn();
		const tx = {
			select: vi.fn(() => ({
				from: vi.fn((table: unknown) => {
					expect(table).toBe(brands);
					return { where: vi.fn(async () => brandIds.map((id) => ({ id }))) };
				}),
			})),
			delete: vi.fn((table: unknown) => {
				const definition = deleteDefinitions.get(table);
				if (!definition) throw new Error("Unexpected purge table");
				return {
					where: vi.fn(() => ({
						returning: vi.fn(async () => {
							order.push(definition.label);
							return Array.from({ length: definition.count }, (_, index) => ({ id: `${definition.label}-${index}` }));
						}),
					})),
				};
			}),
			update: vi.fn((table: unknown) => {
				expect(table).toBe(trackingProviderAttempts);
				return {
					set: vi.fn((values: unknown) => {
						attemptUpdate(values);
						return {
							where: vi.fn(() => ({
								returning: vi.fn(async () => {
									order.push("providerAttemptsArchived");
									return [{ id: "attempt-1" }, { id: "attempt-2" }];
								}),
							})),
						};
					}),
				};
			}),
		};
		return { tx, order, attemptUpdate };
	}

	it("detaches accounting audit before deleting every owned product layer", async () => {
		const now = new Date("2026-08-02T00:00:00.000Z");
		const fake = transaction(["brand-1", "brand-2"]);
		const summary = await purgeCloudOrganizationProductDataInTransaction(fake.tx as never, {
			organizationId: "org-1",
			retentionRunId: "60000000-0000-4000-8000-000000000001",
			now,
		});

		expect(fake.order).toEqual([
			"apiKeys",
			"reports",
			"providerAttemptsArchived",
			"citations",
			"opportunityReports",
			"competitors",
			"trackingTasks",
			"trackingOccurrences",
			"trackingSchedules",
			"promptTargetAssignments",
			"brandTargetSelections",
			"brandSchedulerRollouts",
			"promptRuns",
			"brandAnalysisAdmissions",
			"prompts",
			"brands",
		]);
		expect(summary).toEqual({
			apiKeys: 1,
			reports: 2,
			providerAttemptsArchived: 2,
			citations: 3,
			opportunityReports: 4,
			competitors: 5,
			trackingTasks: 6,
			trackingOccurrences: 7,
			trackingSchedules: 8,
			promptTargetAssignments: 9,
			brandTargetSelections: 10,
			brandSchedulerRollouts: 11,
			promptRuns: 12,
			brandAnalysisAdmissions: 13,
			prompts: 14,
			brands: 15,
		});
		expect(fake.attemptUpdate).toHaveBeenCalledWith(buildRetainedProviderAttemptUpdate(expect.any(String), now));
	});

	it("still revokes API keys, reports, and unattached usage audit for an empty workspace", async () => {
		const fake = transaction([]);
		const summary = await purgeCloudOrganizationProductDataInTransaction(fake.tx as never, {
			organizationId: "org-1",
			retentionRunId: "60000000-0000-4000-8000-000000000001",
			now: new Date("2026-08-02T00:00:00.000Z"),
		});

		expect(fake.order).toEqual(["apiKeys", "reports", "providerAttemptsArchived"]);
		expect(summary).toMatchObject({ apiKeys: 1, reports: 2, providerAttemptsArchived: 2, brands: 0 });
	});
});
