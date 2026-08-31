/** The answers the engines actually gave, and what they cited. */
import { pageEnvelope } from "@/lib/api/analytics-range";
import { ApiError } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";
import { findPromptBrandId } from "@/server/prompts-core";
import { findRunDetail, listPromptRuns } from "@/server/runs-core";
import {
	dateWindowArgs,
	defineTool,
	modelArg,
	pagingArgs,
	pagingFrom,
	promptIdArg,
	resolveAnalyticsWindow,
} from "./define";

export const listRuns = defineTool({
	name: "list_runs",
	title: "List answers recorded for a prompt",
	description:
		"Metadata for the answers recorded for one prompt, newest first. The answer text lives on get_run, which keeps this list small enough to page through.",
	scopes: ["runs:read"],
	readOnly: true,
	input: {
		promptId: promptIdArg,
		model: modelArg,
		...dateWindowArgs,
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		// A prompt in another tenant reads exactly as one that isn't there.
		const brandId = await findPromptBrandId(args.promptId);
		if (!brandId || !(await isBrandInScope(auth, brandId))) {
			throw new ApiError(404, "Not Found", `Prompt with ID '${args.promptId}' not found`);
		}

		const { limit, offset, page } = pagingFrom(args);
		const { data, total } = await listPromptRuns({
			promptId: args.promptId,
			window: resolveAnalyticsWindow(args),
			limit,
			offset,
			model: args.model,
		});
		return { data, pagination: pageEnvelope(page, limit, total) };
	},
});

export const getRun = defineTool({
	name: "get_run",
	title: "Get one answer in full",
	description:
		"One recorded answer: the engine's reply as text, and every page it cited. Read this when you need to know *how* an engine described the brand, not just whether it did.",
	scopes: ["runs:read"],
	readOnly: true,
	input: { runId: promptIdArg.describe("Run id, from list_runs.") },
	run: async ({ auth }, args) => {
		const run = await findRunDetail(args.runId);
		// A run in another tenant reads exactly as one that isn't there.
		if (!run || !(await isBrandInScope(auth, run.brandId))) {
			throw new ApiError(404, "Not Found", `Run with ID '${args.runId}' not found`);
		}
		return run;
	},
});
