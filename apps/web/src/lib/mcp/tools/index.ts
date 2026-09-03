/**
 * The product as a workspace member has it, and no more: `McpTool` has no
 * `adminOnly`, so an instance key gets what an organization key gets.
 */
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import { type Principal, principalScopes } from "@/lib/auth/api-auth";
import { getDeployment } from "@/lib/config/server";
import { getAnalytics, getCitations, getOpportunities, getPromptPerformance, getQueryFanout } from "./analytics";
import { getBilling, getBrand, listBrandsTool, listCompetitorsTool } from "./brands";
import type { McpTool } from "./define";
import { listModels, whoami } from "./identity";
import { createPromptsTool, listPromptsTool, listPromptTags, updatePromptTool } from "./prompts";
import { getRun, listRuns } from "./runs";

export type { McpTool } from "./define";

export const MCP_TOOLS: readonly McpTool[] = [
	whoami,
	listModels,
	listBrandsTool,
	getBrand,
	listCompetitorsTool,
	getBilling,
	listPromptsTool,
	listPromptTags,
	createPromptsTool,
	updatePromptTool,
	getAnalytics,
	getPromptPerformance,
	getCitations,
	getQueryFanout,
	getOpportunities,
	listRuns,
	getRun,
];

/** Filtered rather than refused at call time, so `tools/list` is an honest
 * statement of what this connection can do. */
export function toolsFor(auth: Principal): McpTool[] {
	const held = principalScopes(auth);
	const readOnlyDeployment = getDeployment().features.readOnly;
	return MCP_TOOLS.filter((tool) => {
		if (readOnlyDeployment && !tool.readOnly) return false;
		return tool.scopes.every((scope) => held.has(scope));
	});
}

export const TOOL_SCOPES: readonly ApiScope[] = API_SCOPES.filter((scope) =>
	MCP_TOOLS.some((tool) => tool.scopes.includes(scope)),
);
