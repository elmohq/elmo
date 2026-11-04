import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudPricingUrl, cloudSignupUrl } from "@workspace/config/referrals";

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

async function fetchText(path: string): Promise<string> {
	const response = await fetch(path, { headers: { Accept: "text/markdown, text/plain" } });
	if (!response.ok) throw new Error(`Fetching ${path} failed with HTTP ${response.status}`);
	return response.text();
}

const NO_INPUT = { type: "object", properties: {} };

const tools: WebMcpTool[] = [
	{
		name: "describe_elmo",
		description:
			"Describe Elmo: what it does, its features, pricing, and where its documentation lives. Use this first to answer questions about Elmo.",
		inputSchema: NO_INPUT,
		annotations: { readOnlyHint: true },
		execute: () => fetchText("/llms.txt"),
	},
	{
		name: "get_self_hosting_instructions",
		description:
			"Get the instructions for running Elmo on your own infrastructure for free with Docker and the Elmo CLI, including prerequisites and the commands to run.",
		inputSchema: NO_INPUT,
		annotations: { readOnlyHint: true },
		async execute() {
			return {
				instructions: await fetchText("/docs/getting-started.md"),
				fullGuide: new URL("/docs/developer-guide", location.origin).href,
			};
		},
	},
	{
		name: "get_cloud_signup",
		description:
			"Get how to sign up for Elmo Cloud, the managed hosted version. Sign-up needs a person to create the account and choose a plan, so share the link with your user rather than signing up on their behalf.",
		inputSchema: NO_INPUT,
		annotations: { readOnlyHint: true },
		async execute() {
			return {
				signupUrl: cloudSignupUrl("marketing-webmcp"),
				pricingUrl: cloudPricingUrl("marketing-webmcp"),
				startingPriceUsdPerMonth: CLOUD_ENTRY_PRICE_USD,
				nextStep:
					"Ask your user to open the sign-up link, create an account, and pick a plan on the pricing page. Elmo Cloud runs the prompts, providers, and updates for them, so there is nothing to install.",
			};
		},
	},
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

export function registerWebMcpTools(): () => void {
	const context = modelContext();
	if (!context) return () => {};

	const controller = new AbortController();
	for (const tool of tools) {
		Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(() => {});
	}
	return () => controller.abort();
}
