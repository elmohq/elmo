import { type CitationCategory, extractDomain } from "@workspace/lib/citations/domain-categories";

export interface CitationFlowRow {
	model: string;
	url: string;
	title: string | null;
	count: number;
}

type CitationFlowNodeKind = "engine" | "section" | "page" | "more";

export interface CitationFlowNode {
	id: string;
	kind: CitationFlowNodeKind;
	name: string;
	value: number;
	model?: string;
	url?: string;
	title?: string;
	hiddenCount?: number;
	byModel: Record<string, number>;
}

export interface CitationFlowLink {
	source: number;
	target: number;
	value: number;
	model: string;
}

export interface CitationFlow {
	domain: string;
	totalCitations: number;
	pageCount: number;
	sectionCount: number;
	showSections: boolean;
	engines: { model: string; count: number }[];
	nodes: CitationFlowNode[];
	links: CitationFlowLink[];
}

export interface CitationFlowLimits {
	maxSections: number;
	maxPages: number;
}

export const DEFAULT_FLOW_LIMITS: CitationFlowLimits = { maxSections: 6, maxPages: 12 };

const OTHER_SECTIONS = "Other Sections";
/** The section for pages directly under the domain (/pricing), which have no folder to name them. */
const TOP_LEVEL = "Top-Level Pages";

/** The same rule the server read uses: the domain itself or any subdomain of it. */
export function matchesDomain(host: string, domain: string): boolean {
	return host === domain || host.endsWith(`.${domain}`);
}

interface ParsedPage {
	host: string;
	path: string;
	section: string;
	sectionLabel: string;
}

/**
 * Subdomains are their own section; on the domain itself the top-level folder
 * is (/blog), and single-segment pages like /pricing sit under the bare domain,
 * since a folder of one page tells you nothing.
 */
function sectionFor(url: string, domain: string): ParsedPage | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
	if (!matchesDomain(host, domain)) return null;
	const path = parsed.pathname.replace(/\/+$/, "") || "/";
	if (host !== domain) return { host, path, section: host, sectionLabel: host };
	const segments = path.split("/").filter(Boolean);
	if (segments.length < 2) return { host, path, section: host, sectionLabel: TOP_LEVEL };
	return { host, path, section: `${host}/${segments[0]}`, sectionLabel: `/${segments[0]}` };
}

/** The path relative to its section, so the page column doesn't repeat `/blog/` twenty times. */
function pageLabel(page: ParsedPage, domain: string): string {
	if (page.path === "/") return page.host === domain ? "Homepage" : page.host;
	const prefix = page.section.slice(page.host.length);
	return prefix && page.path.startsWith(`${prefix}/`) ? page.path.slice(prefix.length) : page.path;
}

interface PageAgg {
	url: string;
	label: string;
	/** The label without its section stripped, for when two sections share a leaf (/products/crm, /pricing/crm). */
	fullLabel: string;
	title: string | null;
	count: number;
	section: SectionAgg;
	byModel: Map<string, number>;
}

interface SectionAgg {
	key: string;
	label: string;
	count: number;
	byModel: Map<string, number>;
	pages: PageAgg[];
}

const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);
const toRecord = (map: Map<string, number>) => Object.fromEntries(map);
/** Most cited first; ties by name so the layout holds still between loads. */
const ranked = <T extends { count: number }>(items: Iterable<T>, name: (item: T) => string) =>
	[...items].sort((a, b) => b.count - a.count || name(a).localeCompare(name(b)));

function sectionAgg(sections: Map<string, SectionAgg>, parsed: ParsedPage): SectionAgg {
	let section = sections.get(parsed.section);
	if (!section) {
		section = { key: parsed.section, label: parsed.sectionLabel, count: 0, byModel: new Map(), pages: [] };
		sections.set(parsed.section, section);
	}
	return section;
}

function pageAgg(pages: Map<string, PageAgg>, url: string, parsed: ParsedPage, section: SectionAgg, domain: string) {
	let page = pages.get(url);
	if (!page) {
		page = {
			url,
			label: pageLabel(parsed, domain),
			fullLabel: parsed.host === domain ? parsed.path : `${parsed.host}${parsed.path === "/" ? "" : parsed.path}`,
			title: null,
			count: 0,
			section,
			byModel: new Map(),
		};
		pages.set(url, page);
		section.pages.push(page);
	}
	return page;
}

function aggregate(rows: readonly CitationFlowRow[], domain: string) {
	const sections = new Map<string, SectionAgg>();
	const pages = new Map<string, PageAgg>();
	const engineTotals = new Map<string, number>();
	for (const row of rows) {
		const count = Number(row.count);
		const parsed = count > 0 ? sectionFor(row.url, domain) : null;
		if (!parsed) continue;
		add(engineTotals, row.model, count);
		const section = sectionAgg(sections, parsed);
		section.count += count;
		add(section.byModel, row.model, count);
		const page = pageAgg(pages, row.url, parsed, section, domain);
		page.title ??= row.title;
		page.count += count;
		add(page.byModel, row.model, count);
	}
	return { sections, pages, engineTotals };
}

function sumByModel(items: readonly { byModel: Map<string, number> }[]): Map<string, number> {
	const total = new Map<string, number>();
	for (const item of items) for (const [model, value] of item.byModel) add(total, model, value);
	return total;
}

/** The first `max` items, the rest folded; a fold of one saves no row, so then nothing folds. */
function cut<T>(items: readonly T[], max: number): [T[], T[]] {
	const at = items.length - max > 1 ? max : items.length;
	return [items.slice(0, at), items.slice(at)];
}

/**
 * Nodes are emitted column by column in display order and the layout keeps
 * that order, so each column reads top-down in its parents' order.
 */
class FlowWriter {
	nodes: CitationFlowNode[] = [];
	links: CitationFlowLink[] = [];
	private readonly engineIndex = new Map<string, number>();
	constructor(private readonly models: readonly string[]) {}

	node(node: CitationFlowNode): number {
		return this.nodes.push(node) - 1;
	}

	engine(model: string, count: number) {
		const index = this.node({
			id: `engine:${model}`,
			kind: "engine",
			name: model,
			model,
			value: count,
			byModel: { [model]: count },
		});
		this.engineIndex.set(model, index);
	}

	/** One link per engine, so a band keeps its engine colour all the way to the page. */
	flows(source: number | "engine", target: number, byModel: Map<string, number>) {
		for (const model of this.models) {
			const value = byModel.get(model);
			if (!value) continue;
			const from = source === "engine" ? (this.engineIndex.get(model) as number) : source;
			this.links.push({ source: from, target, value, model });
		}
	}
}

function writeSections(out: FlowWriter, visible: SectionAgg[], folded: SectionAgg[]): Map<SectionAgg, number> {
	const sectionOf = new Map<SectionAgg, number>();
	for (const section of visible) {
		const index = out.node({
			id: `section:${section.key}`,
			kind: "section",
			name: section.label,
			value: section.count,
			byModel: toRecord(section.byModel),
		});
		out.flows("engine", index, section.byModel);
		sectionOf.set(section, index);
	}
	if (folded.length === 0) return sectionOf;
	const byModel = sumByModel(folded);
	const index = out.node({
		id: "section:other",
		kind: "section",
		name: OTHER_SECTIONS,
		value: folded.reduce((sum, section) => sum + section.count, 0),
		hiddenCount: folded.length,
		byModel: toRecord(byModel),
	});
	out.flows("engine", index, byModel);
	for (const section of folded) sectionOf.set(section, index);
	return sectionOf;
}

function writeFold(out: FlowWriter, hidden: PageAgg[], sectionOf: Map<SectionAgg, number> | null) {
	const index = out.node({
		id: "more",
		kind: "more",
		name: `${hidden.length} more pages`,
		value: hidden.reduce((sum, page) => sum + page.count, 0),
		hiddenCount: hidden.length,
		byModel: toRecord(sumByModel(hidden)),
	});
	if (!sectionOf) {
		out.flows("engine", index, sumByModel(hidden));
		return;
	}
	const bySection = new Map<number, PageAgg[]>();
	for (const page of hidden) {
		const source = sectionOf.get(page.section) as number;
		bySection.set(source, [...(bySection.get(source) ?? []), page]);
	}
	for (const [source, pages] of [...bySection].sort((a, b) => a[0] - b[0])) {
		out.flows(source, index, sumByModel(pages));
	}
}

function orderedEngines(engineTotals: Map<string, number>, order: readonly string[]) {
	const rank = (model: string) => (order.includes(model) ? order.indexOf(model) : order.length);
	return [...engineTotals]
		.map(([model, count]) => ({ model, count }))
		.sort((a, b) => rank(a.model) - rank(b.model) || b.count - a.count || a.model.localeCompare(b.model));
}

export function buildCitationFlow(input: {
	rows: readonly CitationFlowRow[];
	domain: string;
	/** The brand's tracked models, so engine order (and colour) doesn't move with the filter. */
	modelOrder?: readonly string[];
	limits?: Partial<CitationFlowLimits>;
}): CitationFlow {
	const limits = { ...DEFAULT_FLOW_LIMITS, ...input.limits };
	const domain = extractDomain(input.domain);
	const { sections, pages, engineTotals } = aggregate(input.rows, domain);

	const engines = orderedEngines(engineTotals, input.modelOrder ?? []);
	const totalCitations = engines.reduce((sum, engine) => sum + engine.count, 0);
	const showSections = sections.size > 1;
	const base = { domain, totalCitations, pageCount: pages.size, sectionCount: sections.size, engines, showSections };
	if (totalCitations === 0) return { ...base, showSections: false, nodes: [], links: [] };

	const out = new FlowWriter(engines.map((engine) => engine.model));
	for (const { model, count } of engines) out.engine(model, count);

	const sectionOf = showSections
		? writeSections(
				out,
				...cut(
					ranked(sections.values(), (s) => s.key),
					limits.maxSections,
				),
			)
		: null;

	const [shown, hidden] = cut(
		ranked(pages.values(), (p) => p.url),
		limits.maxPages,
	);
	// Pages read in their section's order, so bands out of a section stay together.
	const sectionRank = (page: PageAgg) => sectionOf?.get(page.section) ?? 0;
	shown.sort((a, b) => sectionRank(a) - sectionRank(b));
	const labelUses = new Map<string, number>();
	for (const page of shown) add(labelUses, page.label, 1);
	for (const page of shown) {
		const index = out.node({
			id: `page:${page.url}`,
			kind: "page",
			name: (labelUses.get(page.label) ?? 0) > 1 ? page.fullLabel : page.label,
			url: page.url,
			title: page.title ?? undefined,
			value: page.count,
			byModel: toRecord(page.byModel),
		});
		out.flows(sectionOf ? (sectionOf.get(page.section) as number) : "engine", index, page.byModel);
	}
	if (hidden.length > 0) writeFold(out, hidden, sectionOf);

	return { ...base, nodes: out.nodes, links: out.links };
}

export interface FlowDomainOption {
	domain: string;
	count: number;
	category: CitationCategory;
}

/** Counts include subdomains so the picker's number matches the chart's total. */
export function flowDomainOptions(
	cited: readonly { domain: string; count: number; category: CitationCategory }[],
	configured: readonly { domain: string; category: CitationCategory }[] = [],
): FlowDomainOption[] {
	const categories = new Map<string, CitationCategory>(cited.map((entry) => [entry.domain, entry.category]));
	for (const { domain, category } of configured) {
		const root = extractDomain(domain);
		if (!root || categories.has(root)) continue;
		if (cited.some((entry) => matchesDomain(entry.domain, root))) categories.set(root, category);
	}
	return ranked(
		[...categories].map(([domain, category]) => ({
			domain,
			category,
			count: cited.reduce((sum, entry) => sum + (matchesDomain(entry.domain, domain) ? entry.count : 0), 0),
		})),
		(option) => option.domain,
	);
}

export function defaultFlowDomain(options: readonly FlowDomainOption[]): string | undefined {
	return (options.find((option) => option.category === "brand") ?? options[0])?.domain;
}
