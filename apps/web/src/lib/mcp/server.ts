import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { evaluateApiKeyAuth, getMcpApiKeys } from "@/lib/auth/policies";
import { getDeployment } from "@/lib/config/server";
import { promptTools } from "./tools-prompts";
import { analyticsTools } from "./tools-analytics";
import type { ElmoTool } from "./types";

/**
 * The MCP tool registry. Task 5 appends `...analyticsTools` here by adding a
 * `tools-analytics.ts` and one spread entry — no other change is required.
 */
export const MCP_TOOLS: ElmoTool[] = [...promptTools, ...analyticsTools];

export type McpToolResult = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

/**
 * Read-only (demo) mode enforcement. Throws if writes are disabled. Only
 * called for tools the registry has NOT whitelisted (`readOnlySafe: false`).
 */
export function assertWritable(): void {
	if (getDeployment().features.readOnly) {
		throw new Error("This operation is not available in read-only (demo) mode");
	}
}

/**
 * Runs a tool: enforces the read-only whitelist, invokes the handler, and
 * maps the result (or any thrown error) into an MCP `CallToolResult`.
 */
export async function runTool(tool: ElmoTool, args: Record<string, unknown>): Promise<McpToolResult> {
	try {
		if (!tool.readOnlySafe) assertWritable();
		const data = await tool.handler(args);
		return { content: [{ type: "text", text: JSON.stringify(data) }] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
	}
}

function registerElmoTool(server: McpServer, tool: ElmoTool): void {
	server.registerTool(
		tool.name,
		{ description: tool.description, inputSchema: tool.inputSchema },
		(args) => runTool(tool, args as Record<string, unknown>),
	);
}

export function buildMcpServer(): McpServer {
	const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
	const server = new McpServer({ name: "elmo", version });
	for (const tool of MCP_TOOLS) registerElmoTool(server, tool);
	return server;
}

/**
 * Handles a POST request to `/api/mcp`. Performs its own auth (the instance-wide
 * `MCP_API_KEY`) and JSON-RPC transport wiring — it deliberately does NOT use
 * `createApiHandler`, which would enforce the admin key and the read-only block.
 * The per-tool read-only whitelist is enforced inside `runTool` instead.
 */
export async function handleMcpPost(request: Request): Promise<Response> {
	const keys = getMcpApiKeys();
	// Instance-wide key (like ADMIN_API_KEYS): tenant-unscoped. Must be
	// re-scoped before cloud multi-tenant mode ships.
	if (keys.length === 0) {
		return Response.json(
			{
				error: "MCP server disabled",
				message:
					"The MCP endpoint is disabled because MCP_API_KEY is not set on this instance. Set MCP_API_KEY (a Bearer token) to enable /api/mcp.",
			},
			{ status: 404 },
		);
	}

	const auth = evaluateApiKeyAuth(request.headers.get("Authorization"), keys);
	if (auth !== "allow") {
		return Response.json({ error: auth.error, message: auth.message }, { status: 401 });
	}

	// Fresh server + stateless transport per request, mirroring the SDK's own
	// Hono/Cloudflare Workers examples. No post-response cleanup is required.
	const server = buildMcpServer();
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	return transport.handleRequest(request);
}
