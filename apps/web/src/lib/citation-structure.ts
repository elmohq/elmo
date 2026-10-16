/**
 * How a brand's own pages are cited: engine → site section → page, weighted by
 * citations. Pure, so the server read and the Storybook fixtures share it.
 *
 * Pages arrive already normalized by the rollups (`cited_pages.url`), which drops
 * `www.`, query-string tracking and trailing slashes, so a section never splits
 * on those.
 */
import { inDomainSet } from "@workspace/lib/citations/domain-categories";

export interface OwnedCitationRow {
	model: string;
	url: string;
	title: string | null;
	count: number;
}

export type CitationStructureNodeKind = "engine" | "section" | "page" | "more";

export interface CitationStructureNode {
	id: string;
	kind: CitationStructureNodeKind;
	/** What the column shows: the engine, `docs.acme.com` / `acme.com/blog`, or the page's path. */
	name: string;
	value: number;
	/** Engines only. */
	model?: string;
	/** Pages only. */
	url?: string;
	title?: string;
	/** Folded nodes only: how many pages (or sections) they stand for. */
	hiddenCount?: number;
	/** Citations of this node per engine, for the tooltip breakdown and per-engine highlighting. */
	byModel: Record<string, number>;
}

export interface CitationStructureLink {
	source: number;
	target: number;
	value: number;
	/** Every link carries one engine's flow, so a page's inbound band is split by engine colour. */
	model: string;
}

export interface CitationStructure {
	totalCitations: number;
	pageCount: number;
	/** Engines in display order with their totals. */
	engines: { model: string; count: number }[];
	nodes: CitationStructureNode[];
	links: CitationStructureLink[];
}

export interface CitationStructureLimits {
	maxSections: number;
	maxPages: number;
}

export const DEFAULT_LIMITS: CitationStructureLimits = { maxSections: 7, maxPages: 20 };

interface ParsedPage {
	host: string;
	path: string;
	section: string;
}

/**
 * Subdomains are their own section; on the owned domain itself the top-level
 * folder is (acme.com/blog), and single-segment pages like /pricing sit under
 * the bare domain, since a folder of one page tells you nothing.
 */
export function sectionFor(url: string, ownedDomains: ReadonlySet<string>): ParsedPage | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const host = parsed.hostname.toLowerCase();
	if (!inDomainSet(host, ownedDomains as Set<string>)) return null;
	const path = parsed.pathname.replace(/\/+$/, "") || "/";
	if (!ownedDomains.has(host)) return { host, path, section: host };
	const segments = path.split("/").filter(Boolean);
	return { host, path, section: segments.length > 1 ? `${host}/${segments[0]}` : host };
}

interface PageAgg {
	url: string;
	path: string;
	title: string | null;
	count: number;
	byModel: Map<string, number>;
}

interface SectionAgg {
	key: string;
	count: number;
	byModel: Map<string, number>;
	pages: Map<string, PageAgg>;
	/** Set on the "Other sections" node: the sections folded into it. */
	folded?: SectionAgg[];
}

const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);
const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
const toRecord = (map: Map<string, number>) => Object.fromEntries(map);

function mergeInto(target: Map<string, number>, source: Map<string, number>) {
	for (const [key, value] of source) add(target, key, value);
}

/** The path relative to its section, so the page column doesn't repeat `/blog/` twenty times. */
function pageLabel(section: string, host: string, path: string): string {
	if (path === "/") return "Homepage";
	const prefix = section.slice(host.length);
	return prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
}

function aggregate(rows: readonly OwnedCitationRow[], ownedDomains: ReadonlySet<string>) {
	const sections = new Map<string, SectionAgg>();
	const engineTotals = new Map<string, number>();
	for (const row of rows) {
		const count = Number(row.count);
		const parsed = count > 0 ? sectionFor(row.url, ownedDomains) : null;
		if (!parsed) continue;
		add(engineTotals, row.model, count);
		let section = sections.get(parsed.section);
		if (!section) {
			section = { key: parsed.section, count: 0, byModel: new Map(), pages: new Map() };
			sections.set(parsed.section, section);
		}
		section.count += count;
		add(section.byModel, row.model, count);
		let page = section.pages.get(row.url);
		if (!page) {
			const path = pageLabel(parsed.section, parsed.host, parsed.path);
			page = { url: row.url, path, title: null, count: 0, byModel: new Map() };
			section.pages.set(row.url, page);
		}
		page.title ??= row.title;
		page.count += count;
		add(page.byModel, row.model, count);
	}
	return { sections, engineTotals };
}

/** The most cited sections, with the rest folded into one "Other sections" node. */
function visibleSections(sections: Iterable<SectionAgg>, max: number): SectionAgg[] {
	const ranked = [...sections].sort(byCount);
	const visible = ranked.slice(0, max);
	const hidden = ranked.slice(max);
	if (hidden.length === 0) return visible;
	const other: SectionAgg = { key: "Other sections", count: 0, byModel: new Map(), pages: new Map(), folded: hidden };
	for (const section of hidden) {
		other.count += section.count;
		mergeInto(other.byModel, section.byModel);
	}
	return [...visible, other];
}

/**
 * Every section keeps its top page, then the rest of the budget goes to the
 * most cited. A fold of a single page saves no row, so that page is shown too.
 */
function shownPages(sections: readonly SectionAgg[], budget: number): Set<PageAgg> {
	const shown = new Set<PageAgg>();
	const candidates: PageAgg[] = [];
	for (const section of sections) {
		const [top, ...rest] = [...section.pages.values()].sort(byCount);
		if (top) shown.add(top);
		candidates.push(...rest);
	}
	for (const page of candidates.sort(byCount)) {
		if (shown.size >= budget) break;
		shown.add(page);
	}
	for (const section of sections) {
		const unshown = [...section.pages.values()].filter((page) => !shown.has(page));
		if (unshown.length === 1) shown.add(unshown[0]);
	}
	return shown;
}

/** What a section's hidden pages fold into; for "Other sections", every page of every folded section. */
function foldedPages(section: SectionAgg, shown: ReadonlySet<PageAgg>) {
	if (section.folded) {
		const pages = section.folded.reduce((sum, s) => sum + s.pages.size, 0);
		return { count: section.count, pages, byModel: section.byModel };
	}
	const folded = { count: 0, pages: 0, byModel: new Map<string, number>() };
	for (const page of section.pages.values()) {
		if (shown.has(page)) continue;
		folded.count += page.count;
		folded.pages += 1;
		mergeInto(folded.byModel, page.byModel);
	}
	return folded;
}

/**
 * Nodes are emitted column by column in display order and the chart lays them
 * out unsorted, so each column reads top-down in its parents' order.
 */
class StructureWriter {
	nodes: CitationStructureNode[] = [];
	links: CitationStructureLink[] = [];
	constructor(private readonly models: readonly string[]) {}

	node(node: CitationStructureNode): number {
		return this.nodes.push(node) - 1;
	}

	/** One link per engine, so a band keeps its engine colour all the way to the page. */
	flows(source: number | ((model: string) => number), target: number, byModel: Map<string, number>) {
		for (const model of this.models) {
			const value = byModel.get(model);
			if (!value) continue;
			this.links.push({ source: typeof source === "number" ? source : source(model), target, value, model });
		}
	}
}

export function buildCitationStructure(input: {
	rows: readonly OwnedCitationRow[];
	ownedDomains: ReadonlySet<string>;
	/** The brand's tracked models, so engine order (and colour) doesn't move with the filter. */
	modelOrder?: readonly string[];
	limits?: Partial<CitationStructureLimits>;
}): CitationStructure {
	const limits = { ...DEFAULT_LIMITS, ...input.limits };
	const { sections, engineTotals } = aggregate(input.rows, input.ownedDomains);

	const order = input.modelOrder ?? [];
	const rank = (model: string) => (order.includes(model) ? order.indexOf(model) : order.length);
	const engines = [...engineTotals]
		.map(([model, count]) => ({ model, count }))
		.sort((a, b) => rank(a.model) - rank(b.model) || b.count - a.count);
	const totalCitations = engines.reduce((sum, engine) => sum + engine.count, 0);
	const pageCount = [...sections.values()].reduce((sum, section) => sum + section.pages.size, 0);
	if (totalCitations === 0) return { totalCitations, pageCount, engines, nodes: [], links: [] };

	const visible = visibleSections(sections.values(), limits.maxSections);
	const shown = shownPages(visible, limits.maxPages);
	const out = new StructureWriter(engines.map((engine) => engine.model));

	const engineIndex = new Map(
		engines.map(({ model, count }) => [
			model,
			out.node({
				id: `engine:${model}`,
				kind: "engine",
				name: model,
				model,
				value: count,
				byModel: { [model]: count },
			}),
		]),
	);
	const sectionIndex = visible.map((section) => {
		const index = out.node({
			id: `section:${section.key}`,
			kind: "section",
			name: section.key,
			value: section.count,
			byModel: toRecord(section.byModel),
			...(section.folded ? { hiddenCount: section.folded.length } : {}),
		});
		out.flows((model) => engineIndex.get(model) as number, index, section.byModel);
		return index;
	});

	for (const [i, section] of visible.entries()) {
		for (const page of [...section.pages.values()].sort(byCount)) {
			if (!shown.has(page)) continue;
			const index = out.node({
				id: `page:${page.url}`,
				kind: "page",
				name: page.path,
				url: page.url,
				title: page.title ?? undefined,
				value: page.count,
				byModel: toRecord(page.byModel),
			});
			out.flows(sectionIndex[i], index, page.byModel);
		}
		const folded = foldedPages(section, shown);
		if (folded.count === 0) continue;
		const index = out.node({
			id: `more:${section.key}`,
			kind: "more",
			name: `${folded.pages} more ${folded.pages === 1 ? "page" : "pages"}`,
			value: folded.count,
			hiddenCount: folded.pages,
			byModel: toRecord(folded.byModel),
		});
		out.flows(sectionIndex[i], index, folded.byModel);
	}

	return { totalCitations, pageCount, engines, nodes: out.nodes, links: out.links };
}
