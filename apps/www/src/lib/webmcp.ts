interface WebMcpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean };
	execute: (input: Record<string, unknown>) => Promise<unknown>;
}

interface ModelContext {
	registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

interface SearchResult {
	type: "page" | "heading" | "text";
	content: string;
	url: string;
}

const MAX_RESULTS = 10;

function modelContext(): ModelContext | undefined {
	// Older Chrome builds put the API on navigator.
	const host = (document as { modelContext?: ModelContext }).modelContext;
	return host ?? (navigator as { modelContext?: ModelContext }).modelContext;
}

const tools: WebMcpTool[] = [
	{
		name: "search_docs",
		description:
			"Search Elmo's documentation, which covers tracking brand visibility in AI answer engines, self-hosting, the REST API, and the MCP server. Returns matching sections with links.",
		inputSchema: {
			type: "object",
			properties: { query: { type: "string", description: "What to look for, in plain words." } },
			required: ["query"],
		},
		annotations: { readOnlyHint: true },
		async execute({ query }) {
			const response = await fetch(`/api/search?${new URLSearchParams({ query: String(query) })}`);
			if (!response.ok) throw new Error(`Search failed with HTTP ${response.status}`);
			const results: SearchResult[] = await response.json();
			return results.slice(0, MAX_RESULTS).map(({ content, url }) => ({
				content,
				url: new URL(url, location.origin).href,
			}));
		},
	},
	{
		name: "open_page",
		description:
			"Navigate this browser tab to a page on elmohq.com, such as /pricing, /docs, or a URL returned by search_docs.",
		inputSchema: {
			type: "object",
			properties: { path: { type: "string", description: "A path on this site, like /docs/api/mcp." } },
			required: ["path"],
		},
		async execute({ path }) {
			const target = new URL(String(path), location.origin);
			if (target.origin !== location.origin) throw new Error("Only pages on this site can be opened.");
			location.assign(target.href);
			return { opened: target.href };
		},
	},
];

/** Returns a cleanup that unregisters the tools. */
export function registerWebMcpTools(): () => void {
	const context = modelContext();
	if (!context) return () => {};

	const controller = new AbortController();
	for (const tool of tools) {
		Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(() => {});
	}
	return () => controller.abort();
}
