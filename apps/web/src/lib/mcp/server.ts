/**
 * Stateless: a fresh server per POST, because the request that opens a session
 * and the one that uses it need not land on the same instance.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ApiError } from "@/lib/api/handler";
import type { Principal } from "@/lib/auth/api-auth";
import { type McpTool, toolsFor } from "./tools";

export const MCP_SERVER_INFO = {
	name: "elmo",
	title: "Elmo AI visibility",
	version: __APP_VERSION__,
} as const;

const INSTRUCTIONS = [
	"Elmo tracks how AI models — ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews — mention and cite brands.",
	"",
	"Start with list_brands to find a brand id; every other brand tool takes one.",
	"get_analytics answers 'how is this brand doing'; get_citations and get_query_fanout answer 'why', and are where an",
	"optimization plan comes from — the pages the models actually read and the searches they actually ran.",
	"",
	"Analytics tools need a window: start and end as ISO 8601 timestamps, half-open, e.g. 2026-01-01T00:00:00Z.",
	"Rates and shares are fractions of 1, not percentages.",
	"",
	"Only the tools this connection is permitted appear in tools/list. Call whoami to see what it is and what it holds.",
].join("\n");

/** An expected failure carries a message the model can act on; anything else is
 * logged and answered generically. */
function toolFailure(name: string, err: unknown): { content: [{ type: "text"; text: string }]; isError: true } {
	const expected = err instanceof ApiError || isWriteDenied(err);
	if (!expected) console.error(`[mcp] ${name} failed:`, err);
	return {
		content: [{ type: "text", text: expected ? (err as Error).message : "The tool failed unexpectedly." }],
		isError: true,
	};
}

/** By name rather than `instanceof`, to avoid pulling in the entitlements graph. */
function isWriteDenied(err: unknown): err is Error {
	return err instanceof Error && err.name === "WriteDeniedError";
}

export function createMcpServer(auth: Principal, tools: readonly McpTool[]): McpServer {
	const server = new McpServer(MCP_SERVER_INFO, { instructions: INSTRUCTIONS });
	const context = { auth, toolNames: tools.map((tool) => tool.name) };

	for (const tool of tools) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.input,
				annotations: {
					title: tool.title,
					readOnlyHint: tool.readOnly,
					// Creating the same prompts twice creates them twice.
					destructiveHint: false,
					idempotentHint: tool.readOnly,
					openWorldHint: false,
				},
			},
			async (args: Record<string, unknown>) => {
				try {
					const result = await tool.run(context, args);
					// Text rather than `structuredContent`: an output schema per tool is a
					// second copy of what `/api/v1` already publishes.
					return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
				} catch (err) {
					return toolFailure(tool.name, err);
				}
			},
		);
	}

	return server;
}

export async function handleMcpRequest(auth: Principal, request: Request): Promise<Response> {
	const transport = new WebStandardStreamableHTTPServerTransport({
		// Buffered rather than streamed: a serverless platform may cut a stream
		// that outlives the handler.
		enableJsonResponse: true,
	});
	const server = createMcpServer(auth, toolsFor(auth));
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await server.close().catch(() => {});
	}
}
