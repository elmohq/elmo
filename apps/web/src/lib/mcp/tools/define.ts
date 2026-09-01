/**
 * What a tool is, and the argument shapes they share.
 *
 * Three properties on `McpTool` are load-bearing:
 *
 *  - **`scopes` decides what a connection can even see.** The server registers
 *    only the tools the caller holds every scope for, so `tools/list` *is* the
 *    caller's capabilities. A key issued read-only is not told about writes and
 *    then refused; it is never offered them.
 *  - **`readOnly` is required, not inferred.** A read-only deployment drops
 *    every tool that declares `false`, and a test pins the exact partition — so
 *    adding a tool that writes is a deliberate act with a test to update, never
 *    an accident of forgetting a flag.
 *  - **Every tool is reachable with an organization key.** There is no
 *    `adminOnly` here and there must never be one: `/api/mcp` offers the
 *    product as a workspace member has it, so an instance-wide key connecting
 *    to it gets the same tools and no others. Operator-only verbs — deleting a
 *    prompt, generating a report, running an analysis — stay on `/api/v1`,
 *    where the caller is a person who typed the request rather than a model
 *    that decided to make it.
 */
import { z } from "zod";
import { type AnalyticsFilters, resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import type { ApiScope } from "@/lib/api/scopes";
import type { Principal } from "@/lib/auth/api-auth";
import type { AnalyticsWindow } from "@/server/analytics-core";

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

export const modelArg = z.string().optional().describe("Restrict to one model, by id from list_models.");

/**
 * The window every analytics tool takes: two instants, half-open `[start, end)`.
 *
 * A timestamp carries its own offset, so there is nothing to agree on out of
 * band and no time zone to pass beside it — the same reason `/api/v1` spells it
 * this way.
 */
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
