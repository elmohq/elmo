/**
 * The tools `/api/mcp` offers.
 *
 * Each is a projection of something `/api/v1` already answers, over the same
 * edge-agnostic functions in `@/server/*-core` — so a number an agent reads
 * here is the number the dashboard shows, and neither surface can drift from
 * the other without the shared function changing under both.
 *
 * **This surface is the product as a workspace member has it, and no more.**
 * There is no admin-only tool and no way to add one: `McpTool` has no
 * `adminOnly`, so an instance-wide key connecting here gets exactly the tools an
 * organization key gets. Deleting a prompt, generating a report, running a brand
 * analysis, and creating a brand or an organization are all absent — every one
 * is either operator-only on `/api/v1` or spends money, and neither is a
 * decision to hand to a model.
 *
 * Tenancy is not restated in any of them. Every brand-scoped tool starts at
 * `requireBrandInScope`, the same call every REST route starts at, which is
 * what makes another tenant's brand read as one that doesn't exist.
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

export type { McpTool, McpToolContext } from "./define";

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

/**
 * The tools a given connection is offered.
 *
 * Filtering here rather than refusing at call time is the point: `tools/list`
 * becomes an honest statement of what this connection can do, so a model never
 * plans around a tool it will be told off for using. A read-only deployment
 * drops every writer for the same reason.
 */
export function toolsFor(auth: Principal): McpTool[] {
	const held = principalScopes(auth);
	const readOnlyDeployment = getDeployment().features.readOnly;
	return MCP_TOOLS.filter((tool) => {
		if (readOnlyDeployment && !tool.readOnly) return false;
		return tool.scopes.every((scope) => held.has(scope));
	});
}

/** Every scope some tool asks for — the set a key needs to reach all of them. */
export const TOOL_SCOPES: readonly ApiScope[] = API_SCOPES.filter((scope) =>
	MCP_TOOLS.some((tool) => tool.scopes.includes(scope)),
);
