import { describe, expect, it } from "vitest";
import {
	buildCitationFlow,
	type CitationFlow,
	type CitationFlowRow,
	defaultFlowDomain,
	flowDomainOptions,
} from "@/lib/citation-flow";

const row = (model: string, url: string, count: number): CitationFlowRow => ({ model, url, title: null, count });

const total = (flow: CitationFlow, kinds: string[]) =>
	flow.nodes.filter((node) => kinds.includes(node.kind)).reduce((sum, node) => sum + node.value, 0);

const names = (flow: CitationFlow, kind: string) =>
	flow.nodes.filter((node) => node.kind === kind).map((node) => [node.name, node.value]);

function throughput(flow: CitationFlow) {
	const inflow = new Map<number, number>();
	const outflow = new Map<number, number>();
	for (const link of flow.links) {
		inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.value);
		outflow.set(link.source, (outflow.get(link.source) ?? 0) + link.value);
	}
	return { inflow, outflow };
}

describe("buildCitationFlow", () => {
	it("follows only the chosen domain and its subdomains, grouping subdomains and top-level folders", () => {
		const flow = buildCitationFlow({
			rows: [
				row("chatgpt", "https://acme.com/blog/a", 3),
				row("chatgpt", "https://acme.com/blog/b", 2),
				row("chatgpt", "https://acme.com/pricing", 4),
				row("perplexity", "https://docs.acme.com/api/auth", 5),
				row("perplexity", "https://notacme.com/", 9),
				row("perplexity", "https://acme.com.evil.io/", 9),
				row("perplexity", "https://hubspot.com/", 7),
			],
			domain: "acme.com",
		});

		expect(flow.totalCitations).toBe(14);
		expect(flow.pageCount).toBe(4);
		expect(names(flow, "section")).toEqual([
			["/blog", 5],
			["docs.acme.com", 5],
			["Top-Level Pages", 4],
		]);
		expect(names(flow, "page").map(([name]) => name)).toEqual(["/a", "/b", "/api/auth", "/pricing"]);
	});

	it("reads a competitor or third-party domain the same way as the brand's own", () => {
		const flow = buildCitationFlow({
			rows: [
				row("chatgpt", "https://g2.com/categories/crm", 8),
				row("perplexity", "https://g2.com/categories/crm", 4),
				row("perplexity", "https://g2.com/products/acme/reviews", 3),
				row("chatgpt", "https://acme.com/", 50),
			],
			domain: "www.G2.com",
		});
		expect(flow.domain).toBe("g2.com");
		expect(flow.totalCitations).toBe(15);
		expect(names(flow, "section")).toEqual([
			["/categories", 12],
			["/products", 3],
		]);
	});

	it("carries every citation from engine to page, with nothing created or lost at any node", () => {
		const flow = buildCitationFlow({
			rows: [
				row("chatgpt", "https://acme.com/", 6),
				row("perplexity", "https://acme.com/", 4),
				row("perplexity", "https://docs.acme.com/x", 2),
				row("claude", "https://acme.com/blog/y/z", 3),
			],
			domain: "acme.com",
		});

		expect(total(flow, ["engine"])).toBe(15);
		expect(total(flow, ["section"])).toBe(15);
		expect(total(flow, ["page", "more"])).toBe(15);
		const { inflow, outflow } = throughput(flow);
		flow.nodes.forEach((node, i) => {
			if (node.kind !== "engine") expect(inflow.get(i)).toBe(node.value);
			if (node.kind !== "page" && node.kind !== "more") expect(outflow.get(i)).toBe(node.value);
		});
		const intoHomepage = flow.links.filter((link) => flow.nodes[link.target].name === "Homepage");
		expect(intoHomepage.map((link) => [link.model, link.value])).toEqual([
			["chatgpt", 6],
			["perplexity", 4],
		]);
	});

	it("spells out the full path when two sections cite pages with the same name", () => {
		const flow = buildCitationFlow({
			rows: [
				row("chatgpt", "https://hubspot.com/products/crm", 5),
				row("chatgpt", "https://hubspot.com/pricing/crm", 3),
				row("chatgpt", "https://hubspot.com/blog/what-is-crm", 2),
			],
			domain: "hubspot.com",
		});
		expect(names(flow, "page").map(([name]) => name)).toEqual(["/products/crm", "/pricing/crm", "/what-is-crm"]);
	});

	it("drops the section column when every page sits in one section", () => {
		const flow = buildCitationFlow({
			rows: [row("chatgpt", "https://acme.com/", 6), row("perplexity", "https://acme.com/pricing", 4)],
			domain: "acme.com",
		});
		expect(flow.showSections).toBe(false);
		expect(names(flow, "section")).toEqual([]);
		const { inflow } = throughput(flow);
		expect(
			flow.nodes.filter((node) => node.kind === "page").map((node) => inflow.get(flow.nodes.indexOf(node))),
		).toEqual([6, 4]);
	});

	it("folds the long tail of sections and pages into one node each without losing citations", () => {
		const rows = Array.from({ length: 12 }, (_, i) => row("chatgpt", `https://s${i}.acme.com/p${i}`, 12 - i));
		const flow = buildCitationFlow({ rows, domain: "acme.com", limits: { maxSections: 3, maxPages: 4 } });

		const sections = flow.nodes.filter((node) => node.kind === "section");
		expect(sections.map((node) => node.name)).toEqual(["s0.acme.com", "s1.acme.com", "s2.acme.com", "Other Sections"]);
		expect(sections[3].hiddenCount).toBe(9);
		expect(flow.nodes.filter((node) => node.kind === "page")).toHaveLength(4);
		const more = flow.nodes.filter((node) => node.kind === "more");
		expect(more).toHaveLength(1);
		expect(more[0].hiddenCount).toBe(8);
		expect(total(flow, ["page", "more"])).toBe(flow.totalCitations);
	});

	it("shows a lone leftover page rather than folding it", () => {
		const rows = Array.from({ length: 5 }, (_, i) => row("chatgpt", `https://acme.com/p${i}`, 5 - i));
		const flow = buildCitationFlow({ rows, domain: "acme.com", limits: { maxPages: 4 } });
		expect(flow.nodes.filter((node) => node.kind === "page")).toHaveLength(5);
		expect(flow.nodes.some((node) => node.kind === "more")).toBe(false);
	});

	it("orders engines by the brand's models so colours don't move with the data", () => {
		const flow = buildCitationFlow({
			rows: [row("claude", "https://acme.com/", 50), row("chatgpt", "https://acme.com/", 1)],
			domain: "acme.com",
			modelOrder: ["chatgpt", "claude"],
		});
		expect(flow.engines.map((engine) => engine.model)).toEqual(["chatgpt", "claude"]);
	});

	it("is empty when nothing on the domain was cited", () => {
		const flow = buildCitationFlow({ rows: [row("chatgpt", "https://hubspot.com/", 3)], domain: "acme.com" });
		expect(flow.totalCitations).toBe(0);
		expect(flow.nodes).toEqual([]);
	});
});

describe("flowDomainOptions", () => {
	const cited = [
		{ domain: "docs.acme.com", count: 5, category: "brand" as const },
		{ domain: "g2.com", count: 9, category: "reviews" as const },
		{ domain: "blog.hubspot.com", count: 4, category: "competitor" as const },
		{ domain: "hubspot.com", count: 2, category: "competitor" as const },
	];

	it("counts each domain with its subdomains, and offers configured roots that were only cited through a subdomain", () => {
		const options = flowDomainOptions(cited, [
			{ domain: "https://www.acme.com", category: "brand" },
			{ domain: "unseen.com", category: "competitor" },
		]);
		expect(options.map((option) => [option.domain, option.count, option.category])).toEqual([
			["g2.com", 9, "reviews"],
			["hubspot.com", 6, "competitor"],
			["acme.com", 5, "brand"],
			["docs.acme.com", 5, "brand"],
			["blog.hubspot.com", 4, "competitor"],
		]);
	});

	it("defaults to the brand's own site when it is cited, otherwise the most cited domain", () => {
		expect(defaultFlowDomain(flowDomainOptions(cited, [{ domain: "acme.com", category: "brand" }]))).toBe("acme.com");
		expect(defaultFlowDomain(flowDomainOptions(cited.filter((entry) => entry.category !== "brand")))).toBe("g2.com");
		expect(defaultFlowDomain([])).toBeUndefined();
	});
});
