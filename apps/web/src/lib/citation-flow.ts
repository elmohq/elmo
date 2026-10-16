/**
 * How one cited domain is cited: engine → site section → page, weighted by
 * citations. Pure, so the server read, the card and the Storybook fixtures
 * share it.
 *
 * Pages arrive already normalized by the rollups (`cited_pages.url`), which drops
 * `www.`, query-string tracking and trailing slashes, so a section never splits
 * on those.
 */
import { type CitationCategory, extractDomain } from "@workspace/lib/citations/domain-categories";

export interface CitationFlowRow {
	model: string;
	url: string;
	title: string | null;
	count: number;
}

export type CitationFlowNodeKind = "engine" | "section" | "page" | "more";

export interface CitationFlowNode {
	id: string;
	kind: CitationFlowNodeKind;
	/** What the column shows: the engine, `docs.acme.com` / `/blog`, or the page's path. */
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

export interface CitationFlowLink {
	source: number;
	target: number;
	value: number;
	/** Every link carries one engine's flow, so a page's inbound band is split by engine colour. */
	model: string;
}

export interface CitationFlow {
	domain: string;
	totalCitations: number;
	pageCount: number;
	sectionCount: number;
	/** False when every page sits in one section: a column of one node adds nothing to read. */
	showSections: boolean;
	/** Engines in display order with their totals. */
	engines: { model: string; count: number }[];
	nodes: CitationFlowNode[];
	links: CitationFlowLink[];
}

export interface CitationFlowLimits {
	maxSections: number;
	maxPages: number;
}

export const DEFAULT_FLOW_LIMITS: CitationFlowLimits = { maxSections: 6, maxPages: 12 };

export const OTHER_SECTIONS = "Other sections";

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
export function sectionFor(url: string, domain: string): ParsedPage | null {
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
	if (segments.length < 2) return { host, path, section: host, sectionLabel: host };
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

function aggregate(rows: readonly CitationFlowRow[], domain: string) {
	const sections = new Map<string, SectionAgg>();
	const pages = new Map<string, PageAgg>();
	const engineTotals = new Map<string, number>();
	for (const row of rows) {
		const count = Number(row.count);
		const parsed = count > 0 ? sectionFor(row.url, domain) : null;
		if (!parsed) continue;
		add(engineTotals, row.model, count);
		let section = sections.get(parsed.section);
		if (!section) {
			section = { key: parsed.section, label: parsed.sectionLabel, count: 0, byModel: new Map(), pages: [] };
			sections.set(parsed.section, section);
		}
		section.count += count;
		add(section.byModel, row.model, count);
		let page = pages.get(row.url);
		if (!page) {
			page = { url: row.url, label: pageLabel(parsed, domain), title: null, count: 0, section, byModel: new Map() };
			pages.set(row.url, page);
			section.pages.push(page);
		}
		page.title ??= row.title;
		page.count += count;
		add(page.byModel, row.model, count);
	}
	return { sections, pages, engineTotals };
}

/**
 * Nodes are emitted column by column in display order and the layout keeps
 * that order, so each column reads top-down in its parents' order.
 */
class FlowWriter {
	nodes: CitationFlowNode[] = [];
	links: CitationFlowLink[] = [];
	constructor(private readonly models: readonly string[]) {}

	node(node: CitationFlowNode): number {
		return this.nodes.push(node) - 1;
	}

	/** One link per engine, so a band keeps its engine colour all the way to the page. */
	flows(source: (model: string) => number, target: number, byModel: Map<string, number>) {
		for (const model of this.models) {
			const value = byModel.get(model);
			if (value) this.links.push({ source: source(model), target, value, model });
		}
	}
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

	const order = input.modelOrder ?? [];
	const rank = (model: string) => (order.includes(model) ? order.indexOf(model) : order.length);
	const engines = [...engineTotals]
		.map(([model, count]) => ({ model, count }))
		.sort((a, b) => rank(a.model) - rank(b.model) || b.count - a.count || a.model.localeCompare(b.model));
	const totalCitations = engines.reduce((sum, engine) => sum + engine.count, 0);
	const base = { domain, totalCitations, pageCount: pages.size, sectionCount: sections.size, engines };
	if (totalCitations === 0) return { ...base, showSections: false, nodes: [], links: [] };

	// Sections past the limit fold into one node; a fold of one saves nothing.
	const rankedSections = ranked(sections.values(), (s) => s.key);
	const sectionCut = rankedSections.length - limits.maxSections > 1 ? limits.maxSections : rankedSections.length;
	const sectionOf = new Map<SectionAgg, number>();
	const visibleSections = rankedSections.slice(0, sectionCut);
	const otherSections = rankedSections.slice(sectionCut);

	const rankedPages = ranked(pages.values(), (p) => p.url);
	const pageCut = rankedPages.length - limits.maxPages > 1 ? limits.maxPages : rankedPages.length;
	const shown = new Set(rankedPages.slice(0, pageCut));
	const hidden = rankedPages.slice(pageCut);

	const out = new FlowWriter(engines.map((engine) => engine.model));
	const engineIndex = new Map(
		engines.map(({ model, count }) => [
			model,
			out.node({ id: `engine:${model}`, kind: "engine", name: model, model, value: count, byModel: { [model]: count } }),
		]),
	);
	const fromEngine = (model: string) => engineIndex.get(model) as number;

	const showSections = sections.size > 1;
	if (showSections) {
		for (const section of visibleSections) {
			const index = out.node({
				id: `section:${section.key}`,
				kind: "section",
				name: section.label,
				value: section.count,
				byModel: toRecord(section.byModel),
			});
			out.flows(fromEngine, index, section.byModel);
			sectionOf.set(section, index);
		}
		if (otherSections.length > 0) {
			const byModel = new Map<string, number>();
			for (const section of otherSections) for (const [model, value] of section.byModel) add(byModel, model, value);
			const index = out.node({
				id: "section:other",
				kind: "section",
				name: OTHER_SECTIONS,
				value: otherSections.reduce((sum, section) => sum + section.count, 0),
				hiddenCount: otherSections.length,
				byModel: toRecord(byModel),
			});
			out.flows(fromEngine, index, byModel);
			for (const section of otherSections) sectionOf.set(section, index);
		}
	}

	// Pages read in their section's order, so bands out of a section stay together.
	const sectionRank = (page: PageAgg) => (showSections ? (sectionOf.get(page.section) as number) : 0);
	const pageOrder = [...shown].sort((a, b) => sectionRank(a) - sectionRank(b));
	for (const page of pageOrder) {
		const index = out.node({
			id: `page:${page.url}`,
			kind: "page",
			name: page.label,
			url: page.url,
			title: page.title ?? undefined,
			value: page.count,
			byModel: toRecord(page.byModel),
		});
		out.flows(showSections ? () => sectionOf.get(page.section) as number : fromEngine, index, page.byModel);
	}

	if (hidden.length > 0) {
		const byModel = new Map<string, number>();
		for (const page of hidden) for (const [model, value] of page.byModel) add(byModel, model, value);
		const index = out.node({
			id: "more",
			kind: "more",
			name: `${hidden.length} more pages`,
			value: hidden.reduce((sum, page) => sum + page.count, 0),
			hiddenCount: hidden.length,
			byModel: toRecord(byModel),
		});
		if (showSections) {
			// One link per (section, engine) into the fold, in section order.
			const bySection = new Map<number, Map<string, number>>();
			for (const page of hidden) {
				const source = sectionOf.get(page.section) as number;
				const models = bySection.get(source) ?? new Map<string, number>();
				for (const [model, value] of page.byModel) add(models, model, value);
				bySection.set(source, models);
			}
			for (const [source, models] of [...bySection].sort((a, b) => a[0] - b[0])) {
				out.flows(() => source, index, models);
			}
		} else {
			out.flows(fromEngine, index, byModel);
		}
	}

	return { ...base, showSections, nodes: out.nodes, links: out.links };
}

/**
 * The one sentence worth reading before the chart: which engine leads, and
 * where in the domain its citations land.
 */
export interface FlowHeadline {
	model: string;
	/** Share of the domain's citations from that engine, 0–100. */
	share: number;
	/** The section (or page, without sections) that engine cites most. */
	focus: string;
	focusKind: "section" | "page";
	/** Share of the engine's citations that land there, 0–100. */
	focusShare: number;
	soleEngine: boolean;
}

export function flowHeadline(flow: CitationFlow): FlowHeadline | null {
	if (flow.totalCitations === 0) return null;
	const lead = [...flow.engines].sort((a, b) => b.count - a.count)[0];
	const focusKind = flow.showSections ? "section" : "page";
	const candidates = flow.nodes.filter(
		(node) => node.kind === focusKind && !(node.kind === "section" && node.name === OTHER_SECTIONS),
	);
	const focus = ranked(
		candidates.map((node) => ({ node, count: node.byModel[lead.model] ?? 0 })),
		(c) => c.node.id,
	)[0];
	if (!focus || focus.count === 0) return null;
	return {
		model: lead.model,
		share: Math.round((lead.count / flow.totalCitations) * 100),
		focus: focus.node.name,
		focusKind,
		focusShare: Math.round((focus.count / lead.count) * 100),
		soleEngine: flow.engines.length === 1,
	};
}

export interface FlowDomainOption {
	domain: string;
	/** Citations to the domain and its subdomains, matching what the flow will total. */
	count: number;
	category: CitationCategory;
}

/**
 * Every cited host, plus the brand's and competitors' configured domains when
 * only their subdomains were cited, each counted with its subdomains so the
 * picker's number is the chart's total.
 */
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

/** The brand's own site when it is cited at all, otherwise the most cited domain. */
export function defaultFlowDomain(options: readonly FlowDomainOption[]): string | undefined {
	return (options.find((option) => option.category === "brand") ?? options[0])?.domain;
}
