/**
 * The catalog the MCP settings page renders. Read off the registry rather than
 * written down beside it, so a tool that changes its scopes can't leave the
 * page describing the old grant.
 */
import { createServerFn } from "@tanstack/react-start";
import type { ApiScope } from "@/lib/api/scopes";
import { requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { MCP_TOOLS } from "@/lib/mcp/tools";

export interface McpToolSummary {
	name: string;
	title: string;
	scopes: ApiScope[];
	readOnly: boolean;
}

export interface McpPageData {
	tools: McpToolSummary[];
	/** Write tools are withheld entirely on a read-only deployment. */
	readOnlyDeployment: boolean;
}

export const listMcpToolsFn = createServerFn({ method: "GET" }).handler(async (): Promise<McpPageData> => {
	await requireAuthSession();

	return {
		tools: MCP_TOOLS.map((tool) => ({
			name: tool.name,
			title: tool.title,
			scopes: [...tool.scopes],
			readOnly: tool.readOnly,
		})),
		readOnlyDeployment: getDeployment().features.readOnly,
	};
});
