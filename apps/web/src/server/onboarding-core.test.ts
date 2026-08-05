import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	withOrganizationEntitlementTransaction: vi.fn(),
	saveOrganizationPromptsInTransaction: vi.fn(),
	updateBrandTrackingTargetsInTransaction: vi.fn(),
	updateClaudePromptAssignmentsInTransaction: vi.fn(),
	createMultiplePromptJobSchedulers: vi.fn(),
}));

vi.mock("@workspace/lib/cloud/capacity", () => ({
	withOrganizationEntitlementTransaction: mocks.withOrganizationEntitlementTransaction,
}));
vi.mock("@workspace/lib/cloud/prompt-mutations", () => ({
	saveOrganizationPromptsInTransaction: mocks.saveOrganizationPromptsInTransaction,
}));
vi.mock("@workspace/lib/cloud/tracking-settings", () => ({
	TrackingSettingsError: class TrackingSettingsError extends Error {
		name = "TrackingSettingsError";
	},
	updateBrandTrackingTargetsInTransaction: mocks.updateBrandTrackingTargetsInTransaction,
	updateClaudePromptAssignmentsInTransaction: mocks.updateClaudePromptAssignmentsInTransaction,
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

function persistedPrompt(id: string, value: string, enabled = true) {
	return {
		id,
		brandId: "brand-one",
		value,
		enabled,
		tags: [],
		systemTags: [],
		createdAt: new Date("2026-08-05T12:00:00.000Z"),
		updatedAt: new Date("2026-08-05T12:00:00.000Z"),
	};
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

		mocks.withOrganizationEntitlementTransaction.mockImplementation(async ({ mode, run }) => {
			const working = cloneState(persisted);
			const result = await run({
				tx: transactionFor(working),
				resolved: { mode, access: "allowed" },
			});
			persisted = working;
			return result;
		});
		mocks.updateBrandTrackingTargetsInTransaction.mockResolvedValue(undefined);
		mocks.updateClaudePromptAssignmentsInTransaction.mockResolvedValue(undefined);
	});

	it("refuses to complete cloud onboarding without an explicit plan configuration", async () => {
		const before = cloneState(persisted);

		await expect(
			saveWizardOnboarding(
				{
					brandId: "brand-one",
					prompts: [{ value: "Unconfigured prompt", tags: [], enabled: true }],
				},
				{ mode: "cloud", organizationId: "org-one" },
			),
		).rejects.toThrow("Choose this brand's tracking platforms before completing onboarding.");

		expect(persisted).toEqual(before);
		expect(mocks.saveOrganizationPromptsInTransaction).not.toHaveBeenCalled();
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
					cloudTracking: {
						selections: [{ targetKey: "chatgpt", requestedCadenceMinutes: null }],
						claudeAssignments: [],
					},
				},
				{ mode: "cloud", organizationId: "org-one" },
			),
		).rejects.toMatchObject({ name: "CapacityExceededError" });

		expect(persisted).toEqual(before);
		expect(mocks.createMultiplePromptJobSchedulers).not.toHaveBeenCalled();
	});

	it("commits the selected targets, new prompts, and Claude modes in the same cloud transaction", async () => {
		mocks.saveOrganizationPromptsInTransaction.mockResolvedValue({
			prompts: [persistedPrompt("00000000-0000-4000-8000-000000000001", "First prompt")],
			insertedPromptIds: ["00000000-0000-4000-8000-000000000001"],
			activatedPromptIds: ["00000000-0000-4000-8000-000000000001"],
			deactivatedPromptIds: [],
		});

		await saveWizardOnboarding(
			{
				brandId: "brand-one",
				brandName: "Configured brand",
				prompts: [
					{
						clientId: "client-prompt-one",
						value: "First prompt",
						tags: [],
						enabled: true,
					},
				],
				cloudTracking: {
					selections: [
						{ targetKey: "google-ai-mode", requestedCadenceMinutes: null },
						{ targetKey: "google-ai-overview", requestedCadenceMinutes: null },
						{ targetKey: "copilot", requestedCadenceMinutes: null },
						{ targetKey: "perplexity", requestedCadenceMinutes: null },
					],
					claudeAssignments: [{ promptClientId: "client-prompt-one", mode: "native-web-search" }],
				},
			},
			{ mode: "cloud", organizationId: "org-one", createdByUserId: "user-one" },
		);

		expect(mocks.withOrganizationEntitlementTransaction).toHaveBeenCalledTimes(1);
		expect(mocks.updateBrandTrackingTargetsInTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-one",
				brandId: "brand-one",
				createdByUserId: "user-one",
				selections: [
					{ targetKey: "google-ai-mode", requestedCadenceMinutes: null },
					{ targetKey: "google-ai-overview", requestedCadenceMinutes: null },
					{ targetKey: "copilot", requestedCadenceMinutes: null },
					{ targetKey: "perplexity", requestedCadenceMinutes: null },
				],
			}),
		);
		expect(mocks.updateClaudePromptAssignmentsInTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org-one",
				brandId: "brand-one",
				assignments: [{ promptId: "00000000-0000-4000-8000-000000000001", mode: "native-web-search" }],
			}),
		);
		expect(persisted.brand).toMatchObject({ name: "Configured brand", onboarded: true });
		expect(mocks.createMultiplePromptJobSchedulers).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: "duplicate client ids",
			prompts: [
				{ clientId: "duplicate", value: "First prompt", tags: [], enabled: true },
				{ clientId: "duplicate", value: "Second prompt", tags: [], enabled: true },
			],
			persistedPrompts: [
				persistedPrompt("00000000-0000-4000-8000-000000000001", "First prompt"),
				persistedPrompt("00000000-0000-4000-8000-000000000002", "Second prompt"),
			],
			error: "Prompt client id duplicate was submitted twice.",
		},
		{
			name: "duplicate normalized prompt values",
			prompts: [
				{ clientId: "first", value: "Same prompt", tags: [], enabled: true },
				{ clientId: "second", value: "  SAME PROMPT  ", tags: [], enabled: true },
			],
			persistedPrompts: [persistedPrompt("00000000-0000-4000-8000-000000000001", "Same prompt")],
			error: "The same onboarding prompt was submitted twice.",
		},
	])("rolls back cloud onboarding for $name", async ({ prompts, persistedPrompts, error }) => {
		const before = cloneState(persisted);
		mocks.saveOrganizationPromptsInTransaction.mockResolvedValue({
			prompts: persistedPrompts,
			insertedPromptIds: persistedPrompts.map((prompt) => prompt.id),
			activatedPromptIds: persistedPrompts.map((prompt) => prompt.id),
			deactivatedPromptIds: [],
		});

		await expect(
			saveWizardOnboarding(
				{
					brandId: "brand-one",
					brandName: "Must roll back",
					competitors: [{ name: "New competitor", domains: ["new.example"], aliases: [] }],
					prompts,
					cloudTracking: {
						selections: [{ targetKey: "chatgpt", requestedCadenceMinutes: null }],
						claudeAssignments: [{ promptClientId: prompts[0]?.clientId ?? "missing", mode: "base-model" }],
					},
				},
				{ mode: "cloud", organizationId: "org-one" },
			),
		).rejects.toThrow(error);

		expect(persisted).toEqual(before);
		expect(mocks.updateClaudePromptAssignmentsInTransaction).not.toHaveBeenCalled();
		expect(mocks.createMultiplePromptJobSchedulers).not.toHaveBeenCalled();
	});

	it("keeps local onboarding on the legacy scheduler path without plan configuration", async () => {
		mocks.saveOrganizationPromptsInTransaction.mockResolvedValue({
			prompts: [persistedPrompt("00000000-0000-4000-8000-000000000001", "Local prompt")],
			insertedPromptIds: ["00000000-0000-4000-8000-000000000001"],
			activatedPromptIds: ["00000000-0000-4000-8000-000000000001"],
			deactivatedPromptIds: [],
		});

		await saveWizardOnboarding(
			{
				brandId: "brand-one",
				prompts: [{ value: "Local prompt", tags: [], enabled: true }],
			},
			{ mode: "local", organizationId: "org-one" },
		);

		expect(mocks.updateBrandTrackingTargetsInTransaction).not.toHaveBeenCalled();
		expect(mocks.updateClaudePromptAssignmentsInTransaction).not.toHaveBeenCalled();
		expect(mocks.createMultiplePromptJobSchedulers).toHaveBeenCalledWith(["00000000-0000-4000-8000-000000000001"]);
	});
});
