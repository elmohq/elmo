import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { canonicalUrl, SITE_NAME } from "@/lib/seo";

export const mcpServerCard = {
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
		{
			identifier: "urn:air:elmohq.com:api:elmo",
			displayName: `${SITE_NAME} REST API`,
			type: "application/vnd.oai.openapi+json;version=3.1",
			url: canonicalUrl("/api/openapi.json"),
			description:
				"Read and manage the brands, prompts, competitors, and AI-visibility analytics of an Elmo deployment.",
			representativeQueries: [
				"pull AI visibility metrics into a report",
				"export the domains cited in AI answers about a brand",
				"create prompts for AI answer engine tracking programmatically",
			],
		},
		{
			identifier: "urn:air:elmohq.com:docs:llms-txt",
			displayName: `${SITE_NAME} documentation index for LLMs`,
			type: "text/plain",
			url: canonicalUrl("/llms.txt"),
			description: "Annotated index of Elmo's documentation, product pages, and open source resources.",
			representativeQueries: [
				"what is answer engine optimization",
				"how do I self-host an AI visibility tracker",
				"open source alternative to AI brand monitoring tools",
			],
		},
	],
};

export const aiCatalogHeaders = {
	"Access-Control-Allow-Origin": "*",
} as const;
