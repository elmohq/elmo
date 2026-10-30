import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { canonicalUrl, SITE_NAME } from "@/lib/seo";

const mcpServerCard = {
	$schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
	name: "com.elmohq/elmo",
	version: __APP_VERSION__,
	title: `${SITE_NAME} AI visibility`,
	description: "Read AI visibility data — brands, prompts, citations, competitors — and manage prompts.",
	websiteUrl: canonicalUrl("/docs/api/mcp"),
	repository: {
		url: "https://github.com/elmohq/elmo",
		source: "github",
	},
	remotes: [
		{
			type: "streamable-http",
			url: `${CLOUD_APP_URL}/api/mcp`,
		},
	],
};

export const aiCatalog = {
	specVersion: "1.0",
	host: {
		displayName: SITE_NAME,
		identifier: "elmohq.com",
		documentationUrl: canonicalUrl("/docs"),
		logoUrl: canonicalUrl("/brand/icons/elmo-icon-512.png"),
	},
	entries: [
		{
			identifier: "urn:air:elmohq.com:mcp:elmo",
			displayName: `${SITE_NAME} MCP server`,
			type: "application/mcp-server-card+json",
			data: mcpServerCard,
			description:
				"Query how AI answer engines mention and cite a brand, and manage the prompts they are measured against.",
			representativeQueries: [
				"how often does ChatGPT mention my brand",
				"which sources do AI answer engines cite about us",
				"compare my brand's AI visibility against a competitor",
				"add a prompt to track in AI search",
			],
		},
	],
};

export const aiCatalogHeaders = {
	"Access-Control-Allow-Origin": "*",
} as const;
