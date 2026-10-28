import type { CitationFlow, CitationFlowLink, CitationFlowNode } from "@/lib/citation-flow";

export interface FlowLayoutOptions {
	width: number;
	leftGutter: number;
	rightGutter: number;
	nodeWidth: number;
	minSlot: { engine: number; section: number; page: number };
	gap: { engine: number; section: number; page: number };
	/** Pixels per citation never exceed this, so a ten-citation domain isn't drawn as slabs. */
	maxScale: number;
	minHeight: number;
	/** Height budgeted per page row, so bands get some thickness rather than shrinking to the labels. */
	rowHeight: number;
}

export interface PositionedNode {
	index: number;
	node: CitationFlowNode;
	column: number;
	x: number;
	y: number;
	height: number;
}

export interface PositionedLink {
	index: number;
	link: CitationFlowLink;
	width: number;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export interface FlowLayout {
	width: number;
	height: number;
	columnX: number[];
	nodes: PositionedNode[];
	links: PositionedLink[];
}

type ColumnKey = keyof FlowLayoutOptions["minSlot"];

const columnKey = (node: CitationFlowNode): ColumnKey =>
	node.kind === "engine" ? "engine" : node.kind === "section" ? "section" : "page";

function columnHeight(values: number[], scale: number, slot: number, gap: number): number {
	return values.reduce((sum, value) => sum + Math.max(value * scale, slot), 0) + gap * Math.max(values.length - 1, 0);
}

interface Column {
	nodes: number[];
	values: number[];
	slot: number;
	gap: number;
}

function fitScale(columns: Column[], budget: number, max: number): number {
	const fits = (scale: number) => columns.every((c) => columnHeight(c.values, scale, c.slot, c.gap) <= budget);
	if (fits(max)) return max;
	let lo = 0;
	let hi = max;
	for (let step = 0; step < 30; step++) {
		const mid = (lo + hi) / 2;
		if (fits(mid)) lo = mid;
		else hi = mid;
	}
	return lo;
}

// Bands stack in the order of the node at their other end, then by engine, so they cross as little as possible.
function bandCentres(flow: CitationFlow, positioned: PositionedNode[], scale: number, end: "source" | "target") {
	const other = end === "source" ? "target" : "source";
	const engineRank = new Map(flow.engines.map((engine, i) => [engine.model, i]));
	const order = flow.links
		.map((_, i) => i)
		.sort((a, b) => {
			const la = flow.links[a];
			const lb = flow.links[b];
			return (
				positioned[la[other]].y - positioned[lb[other]].y ||
				(engineRank.get(la.model) ?? 0) - (engineRank.get(lb.model) ?? 0)
			);
		});
	const offsets = new Map<number, number>();
	const centres: number[] = [];
	for (const i of order) {
		const link = flow.links[i];
		const node = link[end];
		const offset = offsets.get(node) ?? 0;
		centres[i] = positioned[node].y + offset + (link.value * scale) / 2;
		offsets.set(node, offset + link.value * scale);
	}
	return centres;
}

export function layoutCitationFlow(flow: CitationFlow, options: FlowLayoutOptions): FlowLayout {
	const keys: ColumnKey[] = flow.showSections ? ["engine", "section", "page"] : ["engine", "page"];
	const columns: Column[] = keys.map((key) => {
		const nodes = flow.nodes.flatMap((node, index) => (columnKey(node) === key ? [index] : []));
		return {
			nodes,
			values: nodes.map((index) => flow.nodes[index].value),
			slot: options.minSlot[key],
			gap: options.gap[key],
		};
	});

	const budget = Math.max(
		options.minHeight,
		columns[columns.length - 1].nodes.length * options.rowHeight,
		...columns.map((c) => c.nodes.length * (c.slot + c.gap)),
	);
	const scale = fitScale(columns, budget, Math.min(options.maxScale, budget / Math.max(flow.totalCitations, 1)));
	const heights = columns.map((c) => columnHeight(c.values, scale, c.slot, c.gap));
	// A small domain capped by maxScale shouldn't sit in a tall empty box.
	const height = Math.max(options.minHeight, ...heights);

	const plotLeft = options.leftGutter;
	const plotRight = options.width - options.rightGutter - options.nodeWidth;
	const columnX = keys.map((_, i) => plotLeft + ((plotRight - plotLeft) * i) / Math.max(keys.length - 1, 1));

	const positioned: PositionedNode[] = [];
	for (const [i, column] of columns.entries()) {
		let y = (height - heights[i]) / 2;
		for (const index of column.nodes) {
			const node = flow.nodes[index];
			const nodeHeight = node.value * scale;
			const room = Math.max(nodeHeight, column.slot);
			positioned[index] = { index, node, column: i, x: columnX[i], y: y + (room - nodeHeight) / 2, height: nodeHeight };
			y += room + column.gap;
		}
	}

	const y0 = bandCentres(flow, positioned, scale, "source");
	const y1 = bandCentres(flow, positioned, scale, "target");
	return {
		width: options.width,
		height,
		columnX,
		nodes: positioned,
		links: flow.links.map((link, i) => ({
			index: i,
			link,
			width: link.value * scale,
			x0: positioned[link.source].x + options.nodeWidth,
			y0: y0[i],
			x1: positioned[link.target].x,
			y1: y1[i],
		})),
	};
}
