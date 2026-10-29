import { describe, expect, it } from "vitest";
import { buildGoogleModule, googleModuleTotals, pageGoogleList } from "@/lib/google-module";

const shopping = (product: string, promptId: string, count: number) => ({
	prompt_id: promptId,
	url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(product)}`,
	domain: "google.com",
	title: product,
	count,
});

const module = buildGoogleModule(
	[
		shopping("Acme Serum", "p1", 5),
		shopping("Acme Cream", "p2", 4),
		shopping("Globex Serum", "p1", 3),
		shopping("Generic Toner", "p3", 2),
	],
	"Acme",
	[{ id: "c1", name: "Globex" }],
	(id) => `prompt ${id}`,
);

describe("Google module paging", () => {
	it("pages through every product of one attribution, most cited first", () => {
		const firstPage = pageGoogleList(module, { kind: "products", filter: "brand" }, 0, 1);
		expect(firstPage.total).toBe(2);
		expect(firstPage.items.map((item) => ("name" in item ? item.name : item.query))).toEqual(["Acme Serum"]);
		const secondPage = pageGoogleList(module, { kind: "products", filter: "brand" }, 1, 1);
		expect(secondPage.items.map((item) => ("name" in item ? item.name : item.query))).toEqual(["Acme Cream"]);
	});

	it("sends only the prompt text the page refers to", () => {
		const page = pageGoogleList(module, { kind: "products", filter: "all" }, 0, 1);
		expect(page.promptValues).toEqual({ p1: "prompt p1" });
	});

	it("keeps the totals without the lists", () => {
		const totals = googleModuleTotals(module);
		expect(totals.shopping.products).toEqual([]);
		expect(totals.shopping.productCounts).toEqual({ all: 4, brand: 2, competitor: 1 });
		expect(totals.shopping.brandCount).toBe(9);
	});
});
