import type { ApiScope } from "@/lib/api/scopes";

export interface McpToolSummary {
	name: string;
	title: string;
	scopes: ApiScope[];
	readOnly: boolean;
}

export interface McpPageData {
	tools: McpToolSummary[];
	readOnlyDeployment: boolean;
}

const DEFAULT: McpPageData = {
	tools: [
		{ name: "whoami", title: "Describe the calling key", scopes: [], readOnly: true },
		{ name: "list_brands", title: "List the brands this key can reach", scopes: ["brands:read"], readOnly: true },
		{ name: "list_prompts", title: "List the prompts on a brand", scopes: ["prompts:read"], readOnly: true },
		{ name: "create_prompts", title: "Add prompts to a brand", scopes: ["prompts:write"], readOnly: false },
		{ name: "get_analytics", title: "Read visibility and share of voice", scopes: ["analytics:read"], readOnly: true },
	],
	readOnlyDeployment: false,
};

let _page: McpPageData = DEFAULT;

export function setMockMcpPage(page: Partial<McpPageData>) {
	_page = { ...DEFAULT, ...page };
}

export const listMcpToolsFn = async () => _page;
