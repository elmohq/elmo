/**
 * No delete tool: deleting takes a prompt's runs and citations with it.
 * Disabling is the reversible way to stop a prompt costing runs.
 */
import { prompts } from "@workspace/lib/db/schema";
import { z } from "zod";
import { brandScopeCondition, requireBrandInScope, requirePromptInScope } from "@/lib/api/scope";
import {
	bulkPromptInputSchema,
	createPrompts,
	listPrompts,
	MAX_PROMPT_BATCH,
	promptUpdateFields,
	toPromptSummary,
	updatePrompt,
} from "@/server/prompts-core";
import { listBrandTags } from "@/server/tags-core";
import { brandIdArg, defineTool, promptIdArg, promptTypeArg } from "./define";

export const listPromptsTool = defineTool({
	name: "list_prompts",
	title: "List prompts",
	description:
		"The prompts asked of the models on a brand's behalf. `enabled` is what decides whether a prompt is still being sampled. This is the one list that can get long, so it pages.",
	scopes: ["read"],
	readOnly: true,
	input: {
		brandId: brandIdArg.optional().describe("Restrict to one brand. Omit for every brand in reach."),
		enabled: z.boolean().optional().describe("Restrict to prompts that are or aren't being sampled."),
		tags: z.string().optional().describe("Comma-separated tags; a prompt carrying any of them matches."),
		type: promptTypeArg,
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
			type: args.type,
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
		"The tags in use on a brand's prompts, with how many carry each. Tags are derived: one exists exactly as long as some prompt carries it. Branded vs unbranded is not a tag; filter on `type` for that.",
	scopes: ["read"],
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
	scopes: ["write"],
	readOnly: false,
	destructive: false,
	input: { brandId: brandIdArg, prompts: bulkPromptInputSchema.shape.prompts },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId, "body");
		const created = await createPrompts(brand, { prompts: args.prompts });
		return { data: created.map((prompt) => toPromptSummary(prompt, brand)) };
	},
});

export const updatePromptTool = defineTool({
	name: "update_prompt",
	title: "Update a prompt",
	description:
		"Change a prompt's text, tags, whether it counts as branded, or whether it is being sampled. Setting `enabled: false` is how you stop a prompt costing runs — it keeps every answer already recorded.",
	scopes: ["write"],
	readOnly: false,
	// No `premiumModels`: pairing a prompt with one spends a metered pool, which
	// is a billing decision an agent should not make on someone's behalf.
	input: {
		promptId: promptIdArg,
		value: promptUpdateFields.value,
		enabled: promptUpdateFields.enabled,
		tags: promptUpdateFields.tags,
		branded: promptUpdateFields.branded,
	},
	run: async ({ auth }, args) => {
		const { brand } = await requirePromptInScope(auth, args.promptId);
		const { promptId, ...changes } = args;
		return toPromptSummary(await updatePrompt(brand, promptId, changes), brand);
	},
});
