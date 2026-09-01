/**
 * No delete tool: deleting takes a prompt's runs and citations with it.
 * Disabling is the reversible way to stop a prompt costing runs.
 */
import { prompts } from "@workspace/lib/db/schema";
import { z } from "zod";
import { ApiError } from "@/lib/api/handler";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import type { Principal } from "@/lib/auth/api-auth";
import {
	bulkPromptInputSchema,
	createPrompts,
	listPrompts,
	MAX_PROMPT_BATCH,
	promptUpdateFields,
	requirePrompt,
	updatePrompt,
} from "@/server/prompts-core";
import { listBrandTags } from "@/server/tags-core";
import { brandIdArg, defineTool, promptIdArg } from "./define";

/** A prompt in another tenant is reported exactly as one that doesn't exist,
 * which is why both failures raise the same error. */
async function brandForPrompt(auth: Principal, promptId: string) {
	const notFound = () => new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
	const prompt = await requirePrompt(promptId).catch(() => {
		throw notFound();
	});
	return requireBrandInScope(auth, prompt.brandId).catch(() => {
		throw notFound();
	});
}

export const listPromptsTool = defineTool({
	name: "list_prompts",
	title: "List prompts",
	description:
		"The prompts asked of the models on a brand's behalf. `enabled` is what decides whether a prompt is still being sampled. This is the one list that can get long, so it pages.",
	scopes: ["prompts:read"],
	readOnly: true,
	input: {
		brandId: brandIdArg.optional().describe("Restrict to one brand. Omit for every brand in reach."),
		enabled: z.boolean().optional().describe("Restrict to prompts that are or aren't being sampled."),
		tags: z.string().optional().describe("Comma-separated tags; a prompt carrying any of them matches."),
		q: z.string().optional().describe("Substring match on the prompt text."),
		page: z.number().int().min(1).optional().describe("1-based page number. Defaults to 1."),
		limit: z.number().int().min(1).max(1000).optional().describe("Prompts per page. Defaults to 100."),
	},
	run: async ({ auth }, args) => {
		if (args.brandId) await requireBrandInScope(auth, args.brandId);
		const page = args.page ?? 1;
		const limit = args.limit ?? 100;
		const { data, total } = await listPrompts({
			scope: await brandScopeCondition(auth, prompts.brandId),
			brandId: args.brandId,
			enabled: args.enabled,
			tags: (args.tags ?? "").split(","),
			q: args.q,
			limit,
			offset: (page - 1) * limit,
		});
		return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
	},
});

export const listPromptTags = defineTool({
	name: "list_prompt_tags",
	title: "List prompt tags",
	description:
		"The tags in use on a brand's prompts, with how many carry each. Tags are derived: one exists exactly as long as some prompt carries it.",
	scopes: ["prompts:read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		return { brandId: brand.id, data: await listBrandTags(brand.id) };
	},
});

export const createPromptsTool = defineTool({
	name: "create_prompts",
	title: "Create prompts",
	description: `Add up to ${MAX_PROMPT_BATCH} prompts to a brand in one call. All-or-nothing: a batch that would exceed the organization's plan creates none of it.`,
	scopes: ["prompts:write"],
	readOnly: false,
	input: { brandId: brandIdArg, prompts: bulkPromptInputSchema.shape.prompts },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId, "body");
		return { data: await createPrompts(brand, { prompts: args.prompts }) };
	},
});

export const updatePromptTool = defineTool({
	name: "update_prompt",
	title: "Update a prompt",
	description:
		"Change a prompt's text, tags, or whether it is being sampled. Setting `enabled: false` is how you stop a prompt costing runs — it keeps every answer already recorded.",
	scopes: ["prompts:write"],
	readOnly: false,
	// No `premiumModels`: pairing a prompt with one spends a metered pool, which
	// is a billing decision an agent should not make on someone's behalf.
	input: {
		promptId: promptIdArg,
		value: promptUpdateFields.value,
		enabled: promptUpdateFields.enabled,
		tags: promptUpdateFields.tags,
	},
	run: async ({ auth }, args) => {
		const brand = await brandForPrompt(auth, args.promptId);
		const { promptId, ...changes } = args;
		return updatePrompt(brand, promptId, changes);
	},
});
