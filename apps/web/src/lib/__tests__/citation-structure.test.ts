import { describe, expect, it } from "vitest";
import { buildCitationStructure, type OwnedCitationRow } from "@/lib/citation-structure";

const owned = new Set(["acme.com"]);
const row = (model: string, url: string, count: number): OwnedCitationRow => ({ model, url, title: null, count });

function sumInto(structure: ReturnType<typeof buildCitationStructure>, kind: string) {
	return structure.nodes.filter((node) => node.kind === kind).reduce((sum, node) => sum + node.value, 0);
}

describe("buildCitationStructure", () => {
	it("keeps only the brand's own pages and groups them into subdomains and top-level folders", () => {
		const structure = buildCitationStructure({
			rows: [
				row("chatgpt", "https://acme.com/blog/a", 3),
				row("chatgpt", "https://acme.com/blog/b", 2),
				row("chatgpt", "https://acme.com/pricing", 4),
				row("perplexity", "https://docs.acme.com/api/auth", 5),
				row("perplexity", "https://notacme.com/", 9),
				row("perplexity", "https://hubspot.com/", 7),
			],
			ownedDomains: owned,
		});

		expect(structure.totalCitations).toBe(14);
		expect(structure.pageCount).toBe(4);
		const sections = structure.nodes.filter((node) => node.kind === "section").map((node) => [node.name, node.value]);
		expect(sections).toEqual([
			["acme.com/blog", 5],
			["docs.acme.com", 5],
			["acme.com", 4],
		]);
		const blogPages = structure.nodes.filter((node) => node.kind === "page" && node.url?.includes("/blog/"));
		expect(blogPages.map((node) => node.name)).toEqual(["/a", "/b"]);
	});

	it("carries every citation from engine to a page, splitting each flow by engine", () => {
		const structure = buildCitationStructure({
			rows: [
				row("chatgpt", "https://acme.com/", 6),
				row("perplexity", "https://acme.com/", 4),
				row("perplexity", "https://docs.acme.com/x", 2),
			],
			ownedDomains: owned,
		});

		expect(sumInto(structure, "engine")).toBe(12);
		expect(sumInto(structure, "section")).toBe(12);
		expect(sumInto(structure, "page")).toBe(12);
		const intoHomepage = structure.links.filter((link) => structure.nodes[link.target].name === "Homepage");
		expect(intoHomepage.map((link) => [link.model, link.value])).toEqual([
			["chatgpt", 6],
			["perplexity", 4],
		]);
	});

	it("folds the long tail without losing citations", () => {
		const rows = Array.from({ length: 12 }, (_, i) => row("chatgpt", `https://s${i}.acme.com/p${i}`, 12 - i));
		const structure = buildCitationStructure({ rows, ownedDomains: owned, limits: { maxSections: 3, maxPages: 3 } });

		const sections = structure.nodes.filter((node) => node.kind === "section");
		expect(sections.map((node) => node.name)).toEqual(["s0.acme.com", "s1.acme.com", "s2.acme.com", "Other sections"]);
		expect(sections[3].hiddenCount).toBe(9);
		const more = structure.nodes.filter((node) => node.kind === "more");
		expect(more).toHaveLength(1);
		expect(more[0].hiddenCount).toBe(9);
		expect(sumInto(structure, "page") + sumInto(structure, "more")).toBe(structure.totalCitations);
	});

	it("orders engines by the brand's models so colours don't move with the data", () => {
		const structure = buildCitationStructure({
			rows: [row("claude", "https://acme.com/", 50), row("chatgpt", "https://acme.com/", 1)],
			ownedDomains: owned,
			modelOrder: ["chatgpt", "claude"],
		});
		expect(structure.engines.map((engine) => engine.model)).toEqual(["chatgpt", "claude"]);
	});
});
