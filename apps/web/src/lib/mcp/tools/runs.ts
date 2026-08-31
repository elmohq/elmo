/** The answers the models actually gave, and what they cited. */
import { z } from "zod";
import { ApiError } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";
import { findPromptBrandId } from "@/server/prompts-core";
import { findRunDetail, listPromptRuns } from "@/server/runs-core";
import { defineTool, modelArg, promptIdArg, windowArgs, windowFor } from "./define";

/** A run belongs to a prompt; reaching the prompt is what reaches the run. */
async function requirePromptInScope(auth: Parameters<typeof isBrandInScope>[0], promptId: string) {
	const brandId = await findPromptBrandId(promptId);
	// A prompt in another tenant reads exactly as one that isn't there.
	if (!brandId || !(await isBrandInScope(auth, brandId))) {
		throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
	}
}

export const listRuns = defineTool({
	name: "list_runs",
	title: "List answers recorded for a prompt",
	description:
		"Metadata for the answers recorded for one prompt, newest first. The answer text lives on get_run, which keeps this list small enough to page through.",
	scopes: ["runs:read"],
	readOnly: true,
	input: {
		promptId: promptIdArg,
		start: windowArgs.start,
		end: windowArgs.end,
		model: modelArg,
		page: z.number().int().min(1).optional().describe("1-based page number. Defaults to 1."),
		limit: z.number().int().min(1).max(100).optional().describe("Runs per page. Defaults to 20."),
	},
	run: async ({ auth }, args) => {
		await requirePromptInScope(auth, args.promptId);
		const page = args.page ?? 1;
		const limit = args.limit ?? 20;
		const { data, total } = await listPromptRuns({
			promptId: args.promptId,
			window: windowFor({ start: args.start, end: args.end }),
			limit,
			offset: (page - 1) * limit,
			model: args.model,
		});
		return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
	},
});

export const getRun = defineTool({
	name: "get_run",
	title: "Get one answer in full",
	description:
		"One recorded answer: the model's reply as text, and every page it cited. Read this when you need to know *how* a model described the brand, not just whether it did.",
	scopes: ["runs:read"],
	readOnly: true,
	input: {
		promptId: promptIdArg,
		runId: z.string().describe("Run id, from list_runs."),
	},
	run: async ({ auth }, args) => {
		await requirePromptInScope(auth, args.promptId);
		const run = await findRunDetail(args.promptId, args.runId);
		if (!run) throw new ApiError(404, "Not Found", `Run with ID '${args.runId}' not found`);
		return run;
	},
});
