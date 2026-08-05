import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	withOrganizationEntitlementTransaction: vi.fn(),
	saveOrganizationPromptsInTransaction: vi.fn(),
	createMultiplePromptJobSchedulers: vi.fn(),
}));

vi.mock("@workspace/lib/cloud/capacity", () => ({
	withOrganizationEntitlementTransaction: mocks.withOrganizationEntitlementTransaction,
}));
vi.mock("@workspace/lib/cloud/prompt-mutations", () => ({
	saveOrganizationPromptsInTransaction: mocks.saveOrganizationPromptsInTransaction,
}));
vi.mock("@workspace/lib/db/db", () => ({ db: {} }));
vi.mock("@/lib/job-scheduler", () => ({
	createMultiplePromptJobSchedulers: mocks.createMultiplePromptJobSchedulers,
}));

import { brands, competitors } from "@workspace/lib/db/schema";
import { saveWizardOnboarding } from "./onboarding-core";

type State = {
	brand: typeof brands.$inferSelect;
	competitors: (typeof competitors.$inferSelect)[];
};

function cloneState(state: State): State {
	return structuredClone(state);
}

function transactionFor(state: State) {
	return {
		select: (projection?: unknown) => ({
			from: (table: unknown) => ({
				where: () => {
					const rows =
						table === brands ? [state.brand] : projection ? [{ count: state.competitors.length }] : state.competitors;
					return Object.assign(Promise.resolve(rows), {
						limit: async (limit: number) => rows.slice(0, limit),
					});
				},
			}),
		}),
		update: (table: unknown) => ({
			set: (patch: Partial<typeof brands.$inferSelect>) => ({
				where: () => ({
					returning: async () => {
						if (table !== brands) return [];
						state.brand = { ...state.brand, ...patch };
						return [state.brand];
					},
				}),
			}),
		}),
		insert: (table: unknown) => ({
			values: async (rows: (typeof competitors.$inferInsert)[]) => {
				if (table === competitors) {
					state.competitors.push(
						...rows.map((row, index) => ({
							id: row.id ?? `competitor-${index + 2}`,
							brandId: row.brandId,
							name: row.name,
							domains: row.domains ?? [],
							aliases: row.aliases ?? [],
							createdAt: new Date("2026-08-05T12:00:00.000Z"),
							updatedAt: new Date("2026-08-05T12:00:00.000Z"),
						})),
					);
				}
			},
		}),
	};
}

describe("saveWizardOnboarding", () => {
	let persisted: State;

	beforeEach(() => {
		vi.clearAllMocks();
		persisted = {
			brand: {
				id: "brand-one",
				organizationId: "org-one",
				name: "Original brand",
				website: "https://original.example",
				additionalDomains: [],
				aliases: [],
				enabled: true,
				onboarded: false,
				enabledModels: null,
				delayOverrideHours: null,
				createdAt: new Date("2026-08-05T10:00:00.000Z"),
				updatedAt: new Date("2026-08-05T10:00:00.000Z"),
			},
			competitors: [
				{
					id: "competitor-1",
					brandId: "brand-one",
					name: "Existing competitor",
					domains: ["existing.example"],
					aliases: [],
					createdAt: new Date("2026-08-05T10:00:00.000Z"),
					updatedAt: new Date("2026-08-05T10:00:00.000Z"),
				},
			],
		};

		mocks.withOrganizationEntitlementTransaction.mockImplementation(async ({ run }) => {
			const working = cloneState(persisted);
			const result = await run({
				tx: transactionFor(working),
				resolved: { mode: "cloud", access: "allowed" },
			});
			persisted = working;
			return result;
		});
	});

	it("leaves brand and competitor state untouched when prompt capacity rejects the save", async () => {
		const before = cloneState(persisted);
		mocks.saveOrganizationPromptsInTransaction.mockRejectedValue(
			Object.assign(new Error("This workspace's plan allows at most 50 prompts."), {
				name: "CapacityExceededError",
			}),
		);

		await expect(
			saveWizardOnboarding(
				{
					brandId: "brand-one",
					brandName: "Changed brand",
					website: "changed.example",
					additionalDomains: ["extra.example"],
					aliases: ["Changed"],
					competitors: [{ name: "New competitor", domains: ["new.example"], aliases: [] }],
					prompts: [{ value: "One prompt over the plan limit", tags: [], enabled: true }],
				},
				{ mode: "cloud", organizationId: "org-one" },
			),
		).rejects.toMatchObject({ name: "CapacityExceededError" });

		expect(persisted).toEqual(before);
		expect(mocks.createMultiplePromptJobSchedulers).not.toHaveBeenCalled();
	});
});
