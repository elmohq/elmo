import { z } from "zod";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import {
	createPrompt,
	deletePrompt,
	getPromptById,
	listPrompts,
	updatePrompt,
} from "@/server/prompts-core";
import type { ElmoTool } from "./types";

const list_brands: ElmoTool = {
	name: "list_brands",
	description:
		"List all brands tracked by this elmo instance (id, name, website, enabled). Use the brand id with other tools.",
	readOnlySafe: true,
	inputSchema: {},
	handler: async () => {
		return db
			.select({ id: brands.id, name: brands.name, website: brands.website, enabled: brands.enabled })
			.from(brands);
	},
};

const list_prompts: ElmoTool = {
	name: "list_prompts",
	description:
		"List the tracked prompts for a brand. Filter by enabled state and paginate with page/limit. Returns prompts plus pagination metadata.",
	readOnlySafe: true,
	inputSchema: {
		brandId: z.string(),
		enabled: z.boolean().optional(),
		page: z.number().int().positive().optional(),
		limit: z.number().int().positive().optional(),
	},
	handler: async (args) =>
		listPrompts({
			brandId: args.brandId as string,
			enabled: args.enabled as boolean | undefined,
			page: args.page as number | undefined,
			limit: args.limit as number | undefined,
		}),
};

const get_prompt: ElmoTool = {
	name: "get_prompt",
	description: "Fetch a single tracked prompt by its id, including its tags and enabled state.",
	readOnlySafe: true,
	inputSchema: {
		promptId: z.string(),
	},
	handler: async (args) => getPromptById(args.promptId as string),
};

const create_prompt: ElmoTool = {
	name: "create_prompt",
	description:
		"Create a new tracked prompt for a brand. Provide the brand id and the prompt text; optional tags help organize prompts.",
	readOnlySafe: false,
	inputSchema: {
		brandId: z.string(),
		value: z.string(),
		tags: z.array(z.string()).optional(),
	},
	handler: async (args) =>
		createPrompt({
			brandId: args.brandId as string,
			value: args.value as string,
			tags: args.tags as string[] | undefined,
		}),
};

const update_prompt: ElmoTool = {
	name: "update_prompt",
	description:
		"Update a tracked prompt by id. Any of value, enabled, or tags can be changed; omitted fields are left untouched.",
	readOnlySafe: false,
	inputSchema: {
		promptId: z.string(),
		value: z.string().optional(),
		enabled: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
	},
	handler: async (args) =>
		updatePrompt(args.promptId as string, {
			value: args.value as string | undefined,
			enabled: args.enabled as boolean | undefined,
			tags: args.tags as string[] | undefined,
		}),
};

const delete_prompt: ElmoTool = {
	name: "delete_prompt",
	description:
		"Delete a tracked prompt by id. This also removes its runs and citations and cannot be undone.",
	readOnlySafe: false,
	inputSchema: {
		promptId: z.string(),
	},
	handler: async (args) => deletePrompt(args.promptId as string),
};

export const promptTools: ElmoTool[] = [
	list_brands,
	list_prompts,
	get_prompt,
	create_prompt,
	update_prompt,
	delete_prompt,
];
