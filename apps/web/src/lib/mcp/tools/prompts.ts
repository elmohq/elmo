/**
 * Prompts: the questions asked of the answer engines, and the tags they carry.
 *
 * The write tools take their argument shapes from the schemas `prompts-core`
 * exports rather than restating them, so a value MCP accepts is a value
 * `/api/v1` accepts. Retyping them is how the two surfaces come to disagree
 * about what a prompt is.
 */
import { prompts } from "@workspace/lib/db/schema";
import { z } from "zod";
import { pageEnvelope } from "@/lib/api/analytics-range";
import { ApiError } from "@/lib/api/handler";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import type { Principal } from "@/lib/auth/api-auth";
import {
	bulkPromptInputSchema,
	createPrompts,
	deletePrompt,
	listPrompts,
	MAX_PROMPT_BATCH,
	promptUpdateFields,
	requirePrompt,
	updatePrompt,
} from "@/server/prompts-core";
import { listBrandTags } from "@/server/tags-core";
import { brandIdArg, defineTool, pagingArgs, pagingFrom, promptIdArg } from "./define";

/**
 * The brand a prompt belongs to, if the caller reaches it. A prompt in another
 * tenant is reported exactly as one that doesn't exist, which is why both
 * failures raise the same error.
 */
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
		"The prompts asked of the answer engines on a brand's behalf. `enabled` is what decides whether a prompt is still being sampled.",
	scopes: ["prompts:read"],
	readOnly: true,
	input: {
		brandId: brandIdArg.optional().describe("Restrict to one brand. Omit for every brand in reach."),
		enabled: z.boolean().optional().describe("Restrict to prompts that are or aren't being sampled."),
		tags: z.string().optional().describe("Comma-separated tags; a prompt carrying any of them matches."),
		q: z.string().optional().describe("Substring match on the prompt text."),
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		if (args.brandId) await requireBrandInScope(auth, args.brandId);
		const { limit, offset, page } = pagingFrom(args);
		const { data, total } = await listPrompts({
			scope: await brandScopeCondition(auth, prompts.brandId),
			brandId: args.brandId,
			enabled: args.enabled,
			tags: (args.tags ?? "").split(","),
			q: args.q,
			limit,
			offset,
		});
		return { data, pagination: pageEnvelope(page, limit, total) };
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
	input: {
		brandId: brandIdArg,
		prompts: bulkPromptInputSchema.shape.prompts,
	},
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId, "body");
		return { data: await createPrompts(brand, { prompts: args.prompts }) };
	},
});

export const updatePromptTool = defineTool({
	name: "update_prompt",
	title: "Update a prompt",
	description:
		"Change a prompt's text, tags, or whether it is being sampled. Disabling is the reversible way to stop tracking one — history is kept.",
	scopes: ["prompts:write"],
	readOnly: false,
	// `premiumModels` is deliberately absent: pairing a prompt with a premium
	// engine spends a metered pool, which is a billing decision rather than
	// something an agent should make on someone's behalf.
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

export const deletePromptTool = defineTool({
	name: "delete_prompt",
	title: "Delete a prompt",
	description:
		"Permanently remove a prompt and every answer and citation recorded for it. This cannot be undone — to stop tracking a prompt while keeping its history, call update_prompt with enabled: false instead.",
	scopes: ["prompts:delete"],
	readOnly: false,
	destructive: true,
	input: { promptId: promptIdArg },
	run: async ({ auth }, args) => {
		await brandForPrompt(auth, args.promptId);
		const { prompt, deletedRunsCount } = await deletePrompt(args.promptId);
		return { ...prompt, deletedRunsCount };
	},
});
