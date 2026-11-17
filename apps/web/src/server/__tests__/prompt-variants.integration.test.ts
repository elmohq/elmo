import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrompts, listPrompts, PromptGroupNotFoundError, updatePrompt } from "@/server/prompts-core";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: vi.fn(),
	removePromptJobScheduler: vi.fn(),
}));

const brandOf = (id: string) => ({ id, name: "Acme", website: "https://acme.example", organizationId: id });

let brandId: string;
let otherBrandId: string;

beforeAll(async () => {
	// Self-hosted, so no plan limit stands between these tests and the group rules.
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	brandId = await createBrand();
	otherBrandId = await createBrand();
});

afterAll(async () => {
	await deleteBrand(brandId);
	await deleteBrand(otherBrandId);
	vi.unstubAllEnvs();
});

describe("prompt variants", () => {
	it("gives each new prompt a group of its own", async () => {
		const [first, second] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "best crm" }, { value: "cheapest crm" }],
		});
		expect(first.groupId).not.toBe(second.groupId);
	});

	it("adds a variant to an existing prompt's group and lists the group together", async () => {
		const [lead] = await createPrompts(brandOf(brandId), { prompts: [{ value: "best running shoes" }] });
		const [variant] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "top running shoes", groupId: lead.groupId }],
		});
		expect(variant.groupId).toBe(lead.groupId);

		const { data } = await listPrompts({ brandId, groupId: lead.groupId, limit: 10, offset: 0 });
		expect(data.map((prompt) => prompt.id).sort()).toEqual([lead.id, variant.id].sort());
	});

	it("refuses a group that belongs to another brand, creating nothing", async () => {
		const [foreign] = await createPrompts(brandOf(otherBrandId), { prompts: [{ value: "someone else's prompt" }] });
		await expect(
			createPrompts(brandOf(brandId), { prompts: [{ value: "smuggled variant", groupId: foreign.groupId }] }),
		).rejects.toBeInstanceOf(PromptGroupNotFoundError);

		const { total } = await listPrompts({ brandId, q: "smuggled variant", limit: 10, offset: 0 });
		expect(total).toBe(0);
	});

	it("moves a prompt between groups, and out into its own", async () => {
		const [lead, loner] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "best project tool" }, { value: "top project tool" }],
		});

		const joined = await updatePrompt(brandOf(brandId), loner.id, { groupId: lead.groupId });
		expect(joined.groupId).toBe(lead.groupId);

		const detached = await updatePrompt(brandOf(brandId), loner.id, { groupId: null });
		expect(detached.groupId).not.toBe(lead.groupId);
		expect(detached.groupId).not.toBe(loner.groupId);
	});
});
