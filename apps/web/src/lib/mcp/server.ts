/**
 * Turning a caller and the tool registry into an MCP server, per request.
 *
 * The transport is stateless — a fresh server and transport for every POST,
 * with no session id — because that is the only shape that survives the way
 * this app is deployed: several serverless instances behind one URL, where the
 * request that opens a session and the one that uses it need not land on the
 * same machine. It also means a revoked key stops working on the next call
 * rather than at the end of a session nobody is tracking.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ApiError } from "@/lib/api/handler";
import type { Principal } from "@/lib/auth/api-auth";
import type { McpTool } from "./tools";
import { toolsFor } from "./tools";

/** Shown in `initialize`; how a client names this server in its UI. */
export const MCP_SERVER_INFO = {
	name: "elmo",
	title: "Elmo AI visibility",
	version: __APP_VERSION__,
} as const;

const INSTRUCTIONS = [
	"Elmo tracks how AI answer engines — ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews — mention and cite brands.",
	"",
	"Start with list_brands to find a brand id; every other brand tool takes one.",
	"get_visibility answers 'how is this brand doing'; get_citations and get_query_fanout answer 'why', and are where an",
	"optimization plan comes from — the pages the engines actually read and the searches they actually ran.",
	"",
	"Analytics tools need a window: pass lookback (1w/1m/3m/6m/1y/all) unless you are comparing fixed periods.",
	"Shares and rates are fractions of 1, not percentages.",
	"",
	"Only the tools this connection is permitted appear in tools/list. Call whoami to see what it is and what it holds.",
].join("\n");

/**
 * A tool's failure, as the model should read it.
 *
 * Expected failures (a brand that isn't there, a plan limit, a bad window) are
 * returned as tool errors carrying their own message: the model can act on
 * "that brand doesn't exist" and should not be shown a stack trace. Anything
 * unexpected is logged and answered generically, for the same reason `/api/v1`
 * turns an unknown throw into a bare 500.
 */
function toolFailure(name: string, err: unknown): { content: [{ type: "text"; text: string }]; isError: true } {
	const message =
		err instanceof ApiError || isWriteDenied(err) ? (err as Error).message : "The tool failed unexpectedly.";
	if (!(err instanceof ApiError) && !isWriteDenied(err)) {
		console.error(`[mcp] ${name} failed:`, err);
	}
	return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Entitlement refusals arrive as `WriteDeniedError` from packages/lib. Matched
 * by name rather than by `instanceof` so this module doesn't pull the
 * entitlements graph in just to check a type.
 */
function isWriteDenied(err: unknown): err is Error {
	return err instanceof Error && err.name === "WriteDeniedError";
}

/**
 * `tools` is a parameter rather than something this reads for itself: which
 * tools a caller gets is the registry's question, and answering it here would
 * make "what did the caller actually see" untestable without a database.
 */
export function createMcpServer(auth: Principal, tools: readonly McpTool[]): McpServer {
	const server = new McpServer(MCP_SERVER_INFO, { instructions: INSTRUCTIONS });

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
					destructiveHint: tool.destructive === true,
					// Nothing here is safe to retry blindly: creating the same prompts
					// twice creates them twice.
					idempotentHint: tool.readOnly,
					openWorldHint: false,
				},
			},
			async (args: Record<string, unknown>) => {
				try {
					const result = await tool.run({ auth }, args as never);
					// JSON text rather than `structuredContent`: an output schema per
					// tool would be a second copy of every shape `/api/v1` already
					// publishes, free to drift from it, and every client reads the text
					// block while only some read the structured one.
					return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
				} catch (err) {
					return toolFailure(tool.name, err);
				}
			},
		);
	}

	return server;
}

/** Answer one JSON-RPC request. Nothing is kept between calls. */
export async function handleMcpRequest(auth: Principal, request: Request): Promise<Response> {
	const transport = new WebStandardStreamableHTTPServerTransport({
		// A single buffered JSON reply rather than an SSE stream. Every tool here
		// is request/response with nothing to report mid-flight, and a buffered
		// body is what a serverless function can actually return — a stream that
		// outlives the handler is a stream the platform may cut. It also means
		// `handleRequest` resolves only once the reply is complete, so the server
		// can be torn down on the way out without truncating anything.
		enableJsonResponse: true,
	});
	const server = createMcpServer(auth, toolsFor(auth));
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		// Nothing is kept between calls, so the per-request server and its tool
		// closures are released here rather than left for GC to notice.
		await server.close().catch(() => {});
	}
}
