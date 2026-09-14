/**
 * `scopes` decides what a connection is offered at all, so `tools/list` is the
 * caller's capabilities. `readOnly` is required rather than inferred, so adding
 * a tool that writes is deliberate. There is no `adminOnly` and must not be:
 * operator-only verbs stay on `/api/v1`.
 */
import { z } from "zod";
import { type AnalyticsFilters, resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import type { ApiScope } from "@/lib/api/scopes";
import type { Principal } from "@/lib/auth/api-auth";
import type { AnalyticsWindow } from "@/server/analytics-core";

export interface McpToolContext {
	auth: Principal;
	/** Passed in rather than re-derived, so `whoami` reports what was registered. */
	toolNames: readonly string[];
}

export interface McpTool {
	name: string;
	title: string;
	description: string;
	scopes: readonly ApiScope[];
	readOnly: boolean;
	input: z.ZodRawShape;
	/** Already validated by the SDK; erased because the registry holds many shapes. */
	run(ctx: McpToolContext, args: Record<string, unknown>): Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(tool: {
	name: string;
	title: string;
	description: string;
	scopes?: readonly ApiScope[];
	readOnly: boolean;
	input: S;
	run(ctx: McpToolContext, args: z.output<z.ZodObject<S>>): Promise<unknown>;
}): McpTool {
	return {
		...tool,
		scopes: tool.scopes ?? [],
		run: (ctx, args) => tool.run(ctx, args as z.output<z.ZodObject<S>>),
	};
}

export const brandIdArg = z.string().describe("Brand id, from list_brands.");

export const promptIdArg = z.string().describe("Prompt id, from list_prompts.");

export const modelArg = z.string().optional().describe("Restrict to one model, by id from list_models.");

/** Half-open `[start, end)`. A timestamp carries its own offset, so there is no
 * time zone to pass beside it. */
export const windowArgs = {
	start: z.string().describe("Start of the window, an ISO 8601 timestamp, e.g. 2026-01-01T00:00:00Z. Inclusive."),
	end: z.string().describe("End of the window, an ISO 8601 timestamp. Exclusive."),
	model: modelArg,
	tags: z.string().optional().describe("Comma-separated prompt tags; only prompts carrying one are counted."),
};

export type WindowArgs = z.output<z.ZodObject<typeof windowArgs>>;

export function windowFor(args: WindowArgs): AnalyticsWindow {
	return resolveAnalyticsWindow(args.start, args.end);
}

export function filtersFrom(args: WindowArgs): AnalyticsFilters {
	return { model: args.model, tags: args.tags };
}
