import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudPricingUrl, cloudSignupUrl } from "@workspace/config/referrals";

interface WebMcpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean };
	execute: () => Promise<unknown>;
}

interface ModelContext {
	registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

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
