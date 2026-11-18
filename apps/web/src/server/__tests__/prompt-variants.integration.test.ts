import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrompts, deletePrompt, listPrompts, PromptParentError, updatePrompt } from "@/server/prompts-core";
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

const parentOf = async (id: string) => (await db.select().from(prompts).where(eq(prompts.id, id)))[0]?.parentId;

describe("prompt variants", () => {
	it("creates a prompt with no parent", async () => {
		const [first, second] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "best crm" }, { value: "cheapest crm" }],
		});
		expect(first.parentId).toBeNull();
		expect(second.parentId).toBeNull();
	});

	it("adds a variant under a prompt and lists that prompt's variants", async () => {
		const [parent] = await createPrompts(brandOf(brandId), { prompts: [{ value: "best running shoes" }] });
		const [variant] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "top running shoes", parentId: parent.id }],
		});
		expect(variant.parentId).toBe(parent.id);

		const { data } = await listPrompts({ brandId, parentId: parent.id, limit: 10, offset: 0 });
		expect(data.map((prompt) => prompt.id)).toEqual([variant.id]);
	});

	it("puts a variant of a variant under the same parent", async () => {
		const [parent] = await createPrompts(brandOf(brandId), { prompts: [{ value: "best trail shoes" }] });
		const [variant] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "top trail shoes", parentId: parent.id }],
		});
		const [nested] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "trail shoes worth buying", parentId: variant.id }],
		});
		expect(nested.parentId).toBe(parent.id);
	});

	it("refuses a parent that belongs to another brand, creating nothing", async () => {
		const [foreign] = await createPrompts(brandOf(otherBrandId), { prompts: [{ value: "someone else's prompt" }] });
		await expect(
			createPrompts(brandOf(brandId), { prompts: [{ value: "smuggled variant", parentId: foreign.id }] }),
		).rejects.toBeInstanceOf(PromptParentError);

		const { total } = await listPrompts({ brandId, q: "smuggled variant", limit: 10, offset: 0 });
		expect(total).toBe(0);
	});

	it("makes a prompt a variant of another, and lets it stand on its own again", async () => {
		const [parent, loner] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "best project tool" }, { value: "top project tool" }],
		});

		const joined = await updatePrompt(brandOf(brandId), loner.id, { parentId: parent.id });
		expect(joined.parentId).toBe(parent.id);

		const detached = await updatePrompt(brandOf(brandId), loner.id, { parentId: null });
		expect(detached.parentId).toBeNull();

		await expect(updatePrompt(brandOf(brandId), loner.id, { parentId: loner.id })).rejects.toBeInstanceOf(
			PromptParentError,
		);
	});

	it("swaps a parent with one of its variants when asked to", async () => {
		const [parent] = await createPrompts(brandOf(brandId), { prompts: [{ value: "best standing desk" }] });
		const [first, second] = await createPrompts(brandOf(brandId), {
			prompts: [
				{ value: "top standing desk", parentId: parent.id },
				{ value: "standing desk worth buying", parentId: parent.id },
			],
		});

		const demoted = await updatePrompt(brandOf(brandId), parent.id, { parentId: first.id });
		expect(demoted.parentId).toBe(first.id);
		expect(await parentOf(first.id)).toBeNull();
		expect(await parentOf(second.id)).toBe(first.id);
	});

	it("hands a group to its oldest enabled variant when the parent is disabled, and takes it back when that one is too", async () => {
		const [parent] = await createPrompts(brandOf(brandId), { prompts: [{ value: "best office chair" }] });
		const [first] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "top office chair", parentId: parent.id }],
		});
		const [second] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "office chair worth buying", parentId: parent.id }],
		});

		const disabled = await updatePrompt(brandOf(brandId), parent.id, { enabled: false });
		expect(disabled.parentId).toBe(first.id);
		expect(await parentOf(first.id)).toBeNull();
		expect(await parentOf(second.id)).toBe(first.id);

		await updatePrompt(brandOf(brandId), first.id, { enabled: false });
		expect(await parentOf(second.id)).toBeNull();
		expect(await parentOf(parent.id)).toBe(second.id);
	});

	it("hands a group to a variant when its parent is deleted", async () => {
		const [parent] = await createPrompts(brandOf(brandId), { prompts: [{ value: "best monitor arm" }] });
		const [first] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "top monitor arm", parentId: parent.id }],
		});
		const [second] = await createPrompts(brandOf(brandId), {
			prompts: [{ value: "monitor arm worth buying", parentId: parent.id }],
		});

		await deletePrompt(parent.id);
		expect(await parentOf(first.id)).toBeNull();
		expect(await parentOf(second.id)).toBe(first.id);
	});
});
