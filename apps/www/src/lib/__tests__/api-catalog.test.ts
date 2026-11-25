import { describe, expect, it } from "vitest";
import { apiCatalogResponse } from "@/lib/api-catalog";

const CATALOG = "https://www.elmohq.com/.well-known/api-catalog";

describe("the RFC 9727 API catalog", () => {
	it("is a linkset with the catalog profile", async () => {
		const response = apiCatalogResponse(new Request(CATALOG));

		expect(response.headers.get("Content-Type")).toBe(
			'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
		);
	});

	it("lists every API as an item of the catalog", async () => {
		const { linkset } = await apiCatalogResponse(new Request(CATALOG)).json();

		const catalog = linkset.find((entry: { anchor: string }) => entry.anchor === CATALOG);
		expect(catalog.item.map((link: { href: string }) => link.href)).toEqual([
			"https://app.elmohq.com/api/v1",
			"https://app.elmohq.com/api/mcp",
		]);
	});

	it("describes each listed API in its own entry", async () => {
		const { linkset } = await apiCatalogResponse(new Request(CATALOG)).json();
		const anchors = linkset.map((entry: { anchor: string }) => entry.anchor);

		expect(anchors).toContain("https://app.elmohq.com/api/v1");
		expect(anchors).toContain("https://app.elmohq.com/api/mcp");
	});

	it("answers a HEAD with the api-catalog link and no body", async () => {
		const response = apiCatalogResponse(new Request(CATALOG, { method: "HEAD" }));

		expect(response.headers.get("Link")).toBe('</.well-known/api-catalog>; rel="api-catalog"');
		expect(await response.text()).toBe("");
	});
});
