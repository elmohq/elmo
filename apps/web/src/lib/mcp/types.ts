import type { ZodRawShape } from "zod";

/**
 * Contract for a single MCP tool exposed by the elmo server.
 *
 * Tools wrap existing application logic (e.g. `@/server/prompts-core`); they
 * must not introduce new business logic. The framework in `server.ts`
 * registers each tool with the SDK and enforces the read-only whitelist.
 */
export interface ElmoTool {
	name: string;
	description: string;
	/**
	 * Read-only whitelist flag. Required on every tool — there is no default.
	 * When `false`, the tool is rejected by `assertWritable()` in read-only
	 * (demo) mode. A future mutating tool that forgets this flag fails to
	 * type-check rather than silently becoming reachable in demo mode.
	 */
	readOnlySafe: boolean;
	/** Plain `{ field: zodType }` map passed to the SDK's `registerTool`. */
	inputSchema: ZodRawShape;
	/** Returns plain data; the framework JSON-stringifies it into the MCP result. */
	handler: (args: Record<string, unknown>) => Promise<unknown>;
}
