import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { canonicalUrl } from "@/lib/seo";

const STATUS_URL = "https://status.elmohq.com/";
const CATALOG_PATH = "/.well-known/api-catalog";
const REST_API = `${CLOUD_APP_URL}/api/v1`;
const MCP_SERVER = `${CLOUD_APP_URL}/api/mcp`;

const status = [{ href: STATUS_URL, type: "text/html", title: "Elmo status" }];

export const apiCatalog = {
	linkset: [
		{
			anchor: canonicalUrl(CATALOG_PATH),
			item: [
				{ href: REST_API, title: "Elmo REST API" },
				{ href: MCP_SERVER, title: "Elmo MCP server" },
			],
		},
		{
			anchor: REST_API,
			"service-desc": [
				{
					href: canonicalUrl("/api/openapi.json"),
					type: "application/vnd.oai.openapi+json;version=3.1",
					title: "Elmo API — OpenAPI description",
				},
			],
			"service-doc": [
				{ href: canonicalUrl("/docs/api"), type: "text/html", title: "Elmo API reference" },
				{ href: canonicalUrl("/docs/api.md"), type: "text/markdown", title: "Elmo API reference (markdown)" },
			],
			status,
		},
		{
			anchor: MCP_SERVER,
			"service-doc": [
				{ href: canonicalUrl("/docs/api/mcp"), type: "text/html", title: "Elmo MCP server" },
				{ href: canonicalUrl("/docs/api/mcp.md"), type: "text/markdown", title: "Elmo MCP server (markdown)" },
			],
			status,
		},
	],
};

const headers = {
	"Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
	"Access-Control-Allow-Origin": "*",
	Link: `<${CATALOG_PATH}>; rel="api-catalog"`,
};

/** RFC 9727 §2: a HEAD answers with the api-catalog link and no body. */
export function apiCatalogResponse(request: Request): Response {
	return new Response(request.method === "HEAD" ? null : JSON.stringify(apiCatalog), { headers });
}
