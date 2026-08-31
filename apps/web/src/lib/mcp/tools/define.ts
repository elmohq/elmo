/**
 * What a tool is, and the argument shapes they share.
 *
 * Two properties on `McpTool` are load-bearing:
 *
 *  - **`scopes` decides what a connection can even see.** The server registers
 *    only the tools the caller holds every scope for, so `tools/list` *is* the
 *    caller's capabilities. A key issued read-only is not told about writes and
 *    then refused; it is never offered them.
 *  - **`readOnly` is required, not inferred.** A read-only deployment drops
 *    every tool that declares `false`, and a test pins the exact partition — so
 *    adding a tool that writes is a deliberate act with a test to update, never
 *    an accident of forgetting a flag.
 */
import { z } from "zod";
import { type AnalyticsFilters, resolveAnalyticsWindow, resolvePaging } from "@/lib/api/analytics-range";
import type { ApiScope } from "@/lib/api/scopes";
import type { Principal } from "@/lib/auth/api-auth";

export interface McpToolContext {
	auth: Principal;
	/**
	 * The tools this connection was offered. Passed in rather than re-derived so
	 * `whoami` reports what the server actually registered, and so the registry
	 * does not have to import a tool that imports the registry.
	 */
	toolNames: readonly string[];
}

export interface McpTool {
	name: string;
	title: string;
	description: string;
	/** Scopes an organization key must hold for this tool to be offered at all. */
	scopes: readonly ApiScope[];
	/** False for anything that changes data. Also what a read-only deployment drops. */
	readOnly: boolean;
	/** Set where the effect cannot be undone, so a client can confirm before calling. */
	destructive?: boolean;
	input: z.ZodRawShape;
	/**
	 * Arguments the MCP SDK has already validated against `input`. Typed as the
	 * erased shape because the registry holds tools of many shapes; `defineTool`
	 * is where the specific one is still known.
	 */
	run(ctx: McpToolContext, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * The one place the per-tool argument type is erased.
 *
 * `run` is wrapped rather than the whole object being cast, so every other
 * field stays structurally checked — a misspelled `readOnly` is still a compile
 * error — and the single unavoidable cast sits where the zod shape that
 * justifies it is in scope.
 */
export function defineTool<S extends z.ZodRawShape>(tool: {
	name: string;
	title: string;
	description: string;
	scopes?: readonly ApiScope[];
	readOnly: boolean;
	destructive?: boolean;
	input: S;
	run(ctx: McpToolContext, args: z.output<z.ZodObject<S>>): Promise<unknown>;
}): McpTool {
	return {
		...tool,
		scopes: tool.scopes ?? [],
		run: (ctx, args) => tool.run(ctx, args as z.output<z.ZodObject<S>>),
	};
}

// ============================================================================
// Shared argument shapes
// ============================================================================

export const brandIdArg = z.string().describe("Brand id, from list_brands.");

export const promptIdArg = z.string().describe("Prompt id, from list_prompts.");

export const modelArg = z.string().optional().describe("Restrict to one answer engine, by id from list_platforms.");

/**
 * The window every analytics tool takes, worded for a model rather than for a
 * query string: `lookback` is the one an agent should reach for, and the
 * explicit pair is there for when it is comparing against a fixed period.
 */
export const dateWindowArgs = {
	lookback: z
		.enum(["1w", "1m", "3m", "6m", "1y", "all"])
		.optional()
		.describe("Relative window ending today. Defaults to none — pass this or startDate+endDate."),
	startDate: z.string().optional().describe("Window start, YYYY-MM-DD. Use with endDate instead of lookback."),
	endDate: z.string().optional().describe("Window end, YYYY-MM-DD."),
	timezone: z.string().optional().describe("IANA time zone the day boundaries are drawn in. Defaults to UTC."),
};

/** The window plus the two filters every brand-level analytics tool shares. */
export const windowArgs = {
	...dateWindowArgs,
	model: modelArg,
	tags: z.string().optional().describe("Comma-separated prompt tags; only prompts carrying one are counted."),
};

export const pagingArgs = {
	page: z.number().int().min(1).optional().describe("1-based page number."),
	limit: z.number().int().min(1).max(100).optional().describe("Rows per page, up to 100."),
};

export type WindowArgs = z.output<z.ZodObject<typeof windowArgs>>;
export type PagingArgs = z.output<z.ZodObject<typeof pagingArgs>>;

export function filtersFrom(args: WindowArgs): AnalyticsFilters {
	return { model: args.model, tags: args.tags };
}

export function pagingFrom(args: PagingArgs, defaultLimit = 20) {
	return resolvePaging(args.page, args.limit ?? defaultLimit);
}

export { resolveAnalyticsWindow };
