/**
 * Positions a citation flow as a Sankey: one column per node kind, every
 * column on one scale so a band keeps its width end to end. Each node gets at
 * least a label's height of room, so a two-citation page never has its label
 * collide with its neighbour's.
 */
import type { CitationFlow, CitationFlowLink, CitationFlowNode } from "@/lib/citation-flow";

export interface FlowLayoutOptions {
	width: number;
	/** Room left of the first column for engine labels, and right of the last for page labels. */
	leftGutter: number;
	rightGutter: number;
	nodeWidth: number;
	/** The smallest slot a node takes in each column, so labels never overlap. */
	minSlot: { engine: number; section: number; page: number };
	gap: { engine: number; section: number; page: number };
	/** Pixels per citation never exceed this, so a ten-citation domain isn't drawn as slabs. */
	maxScale: number;
	minHeight: number;
}

export interface PositionedNode {
	index: number;
	node: CitationFlowNode;
	/** 0 for engines; the last column holds the pages. */
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

/** A column's height at `scale`: every node at least its slot, plus the gaps between them. */
function columnHeight(values: number[], scale: number, slot: number, gap: number): number {
	return values.reduce((sum, value) => sum + Math.max(value * scale, slot), 0) + gap * Math.max(values.length - 1, 0);
}

export function layoutCitationFlow(flow: CitationFlow, options: FlowLayoutOptions): FlowLayout {
	const keys: ColumnKey[] = flow.showSections ? ["engine", "section", "page"] : ["engine", "page"];
	const columns = keys.map((key) => flow.nodes.flatMap((node, index) => (columnKey(node) === key ? [index] : [])));
	const total = flow.totalCitations;

	// The page column is the longest; size the chart to it at its slot height, then
	// find the largest scale at which every column still fits.
	const height = Math.max(
		options.minHeight,
		...columns.map((col, i) => col.length * (options.minSlot[keys[i]] + options.gap[keys[i]])),
	);
	let lo = 0;
	let hi = Math.min(options.maxScale, total > 0 ? height / total : 0);
	const fits = (scale: number) =>
		columns.every(
			(col, i) =>
				columnHeight(
					col.map((index) => flow.nodes[index].value),
					scale,
					options.minSlot[keys[i]],
					options.gap[keys[i]],
				) <= height,
		);
	if (fits(hi)) lo = hi;
	else for (let step = 0; step < 30; step++) (fits((lo + hi) / 2) ? (lo = (lo + hi) / 2) : (hi = (lo + hi) / 2));
	const scale = lo;

	const plotLeft = options.leftGutter;
	const plotRight = options.width - options.rightGutter - options.nodeWidth;
	const columnX = keys.map((_, i) => plotLeft + ((plotRight - plotLeft) * i) / Math.max(keys.length - 1, 1));

	const positioned: PositionedNode[] = [];
	for (const [i, col] of columns.entries()) {
		const key = keys[i];
		const slot = options.minSlot[key];
		const gap = options.gap[key];
		const values = col.map((index) => flow.nodes[index].value);
		let y = (height - columnHeight(values, scale, slot, gap)) / 2;
		for (const index of col) {
			const node = flow.nodes[index];
			const nodeHeight = node.value * scale;
			const room = Math.max(nodeHeight, slot);
			positioned[index] = {
				index,
				node,
				column: i,
				x: columnX[i],
				y: y + (room - nodeHeight) / 2,
				height: nodeHeight,
			};
			y += room + gap;
		}
	}

	// Bands leave and enter each node stacked in the order of the node at their
	// other end, then by engine, so they cross as little as possible.
	const outOffset = new Map<number, number>();
	const inOffset = new Map<number, number>();
	const engineRank = new Map(flow.engines.map((engine, i) => [engine.model, i]));
	const byOtherEnd = (end: "source" | "target") => (a: number, b: number) => {
		const la = flow.links[a];
		const lb = flow.links[b];
		return (
			positioned[la[end]].y - positioned[lb[end]].y ||
			(engineRank.get(la.model) ?? 0) - (engineRank.get(lb.model) ?? 0)
		);
	};
	const indices = flow.links.map((_, i) => i);
	const y0 = new Map<number, number>();
	const y1 = new Map<number, number>();
	for (const i of [...indices].sort(byOtherEnd("target"))) {
		const link = flow.links[i];
		const offset = outOffset.get(link.source) ?? 0;
		y0.set(i, positioned[link.source].y + offset + (link.value * scale) / 2);
		outOffset.set(link.source, offset + link.value * scale);
	}
	for (const i of [...indices].sort(byOtherEnd("source"))) {
		const link = flow.links[i];
		const offset = inOffset.get(link.target) ?? 0;
		y1.set(i, positioned[link.target].y + offset + (link.value * scale) / 2);
		inOffset.set(link.target, offset + link.value * scale);
	}

	return {
		width: options.width,
		height,
		columnX,
		nodes: positioned,
		links: indices.map((i) => {
			const link = flow.links[i];
			return {
				index: i,
				link,
				width: link.value * scale,
				x0: positioned[link.source].x + options.nodeWidth,
				y0: y0.get(i) as number,
				x1: positioned[link.target].x,
				y1: y1.get(i) as number,
			};
		}),
	};
}
