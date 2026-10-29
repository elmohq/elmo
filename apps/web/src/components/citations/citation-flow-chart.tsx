import { getModelMeta } from "@workspace/config/models";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useMemo, useState } from "react";
import type { CitationFlow, CitationFlowNode } from "@/lib/citation-flow";
import {
	type FlowLayout,
	layoutCitationFlow,
	type PositionedLink,
	type PositionedNode,
} from "@/lib/citation-flow-layout";

/** Below this width three columns of labels can't share a row, so the flow becomes a ranked list. */
export const MIN_CHART_WIDTH = 640;
const NODE_WIDTH = 8;
const TOOLTIP_OFFSET = 14;
const TOOLTIP_MAX_WIDTH = 288;
const FONT = "12px ui-sans-serif, system-ui, sans-serif";
const BOLD_FONT = `500 ${FONT}`;

export type Focus =
	| { type: "engine"; model: string }
	| { type: "node"; index: number }
	| { type: "link"; index: number };

export const engineLabel = (model: string) => getModelMeta(model).label;

function pct(value: number, total: number) {
	if (total <= 0) return "0%";
	const share = (value / total) * 100;
	return `${share > 0 && share < 1 ? "<1" : Math.round(share)}%`;
}

export function EngineSwatch({ color }: { color: string | undefined }) {
	return <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
/** Rendered label width, so a label is cut to its gutter rather than run under the next column. */
function textWidth(text: string, font = FONT): number {
	if (measureContext === undefined && typeof document !== "undefined") {
		measureContext = document.createElement("canvas").getContext("2d");
	}
	if (!measureContext) return text.length * 6.6;
	measureContext.font = font;
	return measureContext.measureText(text).width;
}

function fitText(text: string, maxWidth: number): string {
	if (textWidth(text) <= maxWidth) return text;
	let end = text.length;
	while (end > 1 && textWidth(`${text.slice(0, end)}…`) > maxWidth) end--;
	return `${text.slice(0, end)}…`;
}

const focusKey = (focus: Focus | null) =>
	focus === null ? "" : focus.type === "engine" ? `engine:${focus.model}` : `${focus.type}:${focus.index}`;

interface Emphasis {
	links: Set<number> | null;
	nodes: Set<number> | null;
}

function linksWhere(flow: CitationFlow, keep: (link: CitationFlow["links"][number]) => boolean) {
	return flow.links.flatMap((link, i) => (keep(link) ? [i] : []));
}

function emphasisFor(flow: CitationFlow, focus: Focus | null): Emphasis {
	if (!focus) return { links: null, nodes: null };
	const links =
		focus.type === "engine"
			? linksWhere(flow, (link) => link.model === focus.model)
			: focus.type === "link"
				? [focus.index]
				: linksWhere(flow, (link) => link.source === focus.index || link.target === focus.index);
	const nodes = new Set(links.flatMap((i) => [flow.links[i].source, flow.links[i].target]));
	if (focus.type === "node") {
		nodes.add(focus.index);
		// The engines behind a page stay lit, but not their whole bands into the
		// section: those carry every page in it and would overstate this one.
		const { byModel } = flow.nodes[focus.index];
		flow.nodes.forEach((other, i) => {
			if (other.kind === "engine" && other.model && byModel[other.model]) nodes.add(i);
		});
	}
	return { links: new Set(links), nodes };
}

function focusAt(flow: CitationFlow, target: EventTarget | null): Focus | null {
	const mark = target instanceof Element ? target.closest<SVGElement>("[data-link],[data-node]") : null;
	if (!mark) return null;
	if (mark.dataset.link !== undefined) return { type: "link", index: Number(mark.dataset.link) };
	const index = Number(mark.dataset.node);
	const { kind, model } = flow.nodes[index];
	return kind === "engine" && model ? { type: "engine", model } : { type: "node", index };
}

function bandPath({ x0, y0, x1, y1 }: Pick<PositionedLink, "x0" | "y0" | "x1" | "y1">) {
	const mid = (x0 + x1) / 2;
	return `M${x0},${y0}C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
}

function useFlowLayout(flow: CitationFlow, width: number) {
	return useMemo(() => {
		const leftGutter = Math.max(...flow.engines.map(({ model }) => textWidth(engineLabel(model), BOLD_FONT)), 60) + 18;
		return layoutCitationFlow(flow, {
			width,
			leftGutter,
			rightGutter: Math.round(Math.min(Math.max(width * 0.3, 200), 320)),
			nodeWidth: NODE_WIDTH,
			minSlot: { engine: 36, section: 24, page: 20 },
			gap: { engine: 10, section: 12, page: 4 },
			maxScale: 5,
			minHeight: 200,
			rowHeight: 34,
		});
	}, [flow, width]);
}

function EngineBreakdown({
	byModel,
	engines,
	colors,
}: {
	byModel: Record<string, number>;
	engines: CitationFlow["engines"];
	colors: Map<string, string>;
}) {
	const rows = engines.filter((engine) => byModel[engine.model] > 0);
	const total = rows.reduce((sum, engine) => sum + byModel[engine.model], 0);
	return (
		<div className="grid gap-1 border-t pt-1.5">
			{rows.map(({ model }) => (
				<div key={model} className="flex items-center gap-2">
					<EngineSwatch color={colors.get(model)} />
					<span className="text-muted-foreground">{engineLabel(model)}</span>
					<span className="ml-auto pl-4 tabular-nums">{byModel[model].toLocaleString()}</span>
					<span className="w-9 text-right text-muted-foreground tabular-nums">{pct(byModel[model], total)}</span>
				</div>
			))}
		</div>
	);
}

function nodeHeading(node: CitationFlowNode): string {
	if (node.kind === "engine" && node.model) return engineLabel(node.model);
	if (node.kind === "page") return node.title || node.name;
	return node.name;
}

function FlowTooltip({
	flow,
	focus,
	colors,
	canExpand,
}: {
	flow: CitationFlow;
	focus: Focus;
	colors: Map<string, string>;
	canExpand: boolean;
}) {
	if (focus.type === "link") {
		const link = flow.links[focus.index];
		const source = flow.nodes[link.source];
		const target = flow.nodes[link.target];
		return (
			<>
				<div className="flex items-center gap-2">
					<EngineSwatch color={colors.get(link.model)} />
					<span className="font-medium">{engineLabel(link.model)}</span>
				</div>
				<div className="text-muted-foreground break-words">
					{source.kind === "engine" ? nodeHeading(target) : `${source.name} → ${nodeHeading(target)}`}
				</div>
				<div className="tabular-nums">
					<span className="font-medium">{link.value.toLocaleString()}</span> citations · {pct(link.value, target.value)}{" "}
					of this {target.kind === "section" ? "section" : "page"}
				</div>
			</>
		);
	}
	const node =
		focus.type === "node"
			? flow.nodes[focus.index]
			: flow.nodes.find((candidate) => candidate.kind === "engine" && candidate.model === focus.model);
	if (!node) return null;
	return (
		<>
			<div className="font-medium break-words">{nodeHeading(node)}</div>
			{node.url && <div className="text-muted-foreground break-all">{node.url.replace(/^https?:\/\//, "")}</div>}
			{node.kind === "section" && node.hiddenCount && (
				<div className="text-muted-foreground">{node.hiddenCount} smaller sections</div>
			)}
			<div className="tabular-nums">
				<span className="font-medium">{node.value.toLocaleString()}</span> citations ·{" "}
				{pct(node.value, flow.totalCitations)} of {flow.domain}
			</div>
			{node.kind !== "engine" && <EngineBreakdown byModel={node.byModel} engines={flow.engines} colors={colors} />}
			{node.kind === "page" && <div className="text-muted-foreground">Click to open the page</div>}
			{node.kind === "engine" && <div className="text-muted-foreground">Click to highlight its citations</div>}
			{node.kind === "more" && canExpand && <div className="text-muted-foreground">Click to show all pages</div>}
		</>
	);
}

function NodeGroup({
	index,
	lit,
	button,
	children,
}: {
	index: number;
	lit: boolean;
	button?: { label: string; pressed?: boolean };
	children: ReactNode;
}) {
	return (
		<g
			data-node={index}
			opacity={lit ? 1 : 0.3}
			className={cn(
				"transition-opacity duration-150",
				button && "cursor-pointer focus-visible:outline-2 focus-visible:outline-ring",
			)}
			{...(button && { role: "button", tabIndex: 0, "aria-label": button.label, "aria-pressed": button.pressed })}
		>
			{children}
		</g>
	);
}

function NodeBar({ positioned, className, fill }: { positioned: PositionedNode; className?: string; fill?: string }) {
	return (
		<rect
			x={positioned.x}
			y={positioned.y}
			width={NODE_WIDTH}
			height={Math.max(positioned.height, 2)}
			rx={2}
			fill={fill}
			className={className}
		/>
	);
}

function EngineMark({
	positioned,
	color,
	totalCitations,
}: {
	positioned: PositionedNode;
	color: string | undefined;
	totalCitations: number;
}) {
	const { node, x } = positioned;
	const midY = positioned.y + positioned.height / 2;
	return (
		<>
			<NodeBar positioned={positioned} fill={color} />
			<text
				x={x - 10}
				y={midY - 7}
				textAnchor="end"
				dominantBaseline="middle"
				className="fill-foreground text-xs font-medium"
			>
				{nodeHeading(node)}
			</text>
			<text
				x={x - 10}
				y={midY + 8}
				textAnchor="end"
				dominantBaseline="middle"
				className="fill-muted-foreground text-[11px] tabular-nums"
			>
				{node.value.toLocaleString()} · {pct(node.value, totalCitations)}
			</text>
			{/* A label-sized hit target, so a two-citation engine is still easy to hover. */}
			<rect x={x - 110} y={midY - 16} width={110 + NODE_WIDTH} height={32} fill="transparent" />
		</>
	);
}

function SectionMark({ positioned }: { positioned: PositionedNode }) {
	const { node } = positioned;
	const midY = positioned.y + positioned.height / 2;
	const count = node.value.toLocaleString();
	const chipX = positioned.x + NODE_WIDTH + 6;
	const chipWidth = textWidth(node.name, BOLD_FONT) + textWidth(count) + 22;
	return (
		<>
			<NodeBar positioned={positioned} className="fill-muted-foreground/60" />
			{/* Section labels sit on a chip so they read over the bands leaving them. */}
			<rect x={chipX} y={midY - 10} width={chipWidth} height={20} rx={4} className="fill-card/85" />
			<text x={chipX + 8} y={midY + 0.5} dominantBaseline="middle" className="text-xs">
				<tspan className={cn("font-medium", node.hiddenCount ? "fill-muted-foreground" : "fill-foreground")}>
					{node.name}
				</tspan>
				<tspan dx={6} className="fill-muted-foreground tabular-nums">
					{count}
				</tspan>
			</text>
		</>
	);
}

function PageMark({ positioned, labelWidth }: { positioned: PositionedNode; labelWidth: number }) {
	const { node, x } = positioned;
	const midY = positioned.y + positioned.height / 2;
	const count = node.value.toLocaleString();
	const isMore = node.kind === "more";
	return (
		<>
			<NodeBar positioned={positioned} className="fill-muted-foreground/35" />
			<text x={x + NODE_WIDTH + 8} y={midY + 0.5} dominantBaseline="middle" className="text-xs">
				<tspan className={isMore ? "fill-muted-foreground" : "fill-foreground group-hover:underline"}>
					{fitText(isMore ? `+ ${node.name}` : node.name, labelWidth - textWidth(count) - 8)}
				</tspan>
				<tspan dx={6} className="fill-muted-foreground tabular-nums">
					{count}
				</tspan>
			</text>
			<rect x={x} y={midY - 10} width={labelWidth + NODE_WIDTH + 8} height={20} fill="transparent" />
		</>
	);
}

function FlowNodeMark({
	positioned,
	flow,
	colors,
	lit,
	pageLabelWidth,
	pinned,
	canExpand,
}: {
	positioned: PositionedNode;
	flow: CitationFlow;
	colors: Map<string, string>;
	lit: boolean;
	pageLabelWidth: number;
	pinned: string | null;
	canExpand: boolean;
}) {
	const { node, index } = positioned;
	if (node.kind === "engine") {
		return (
			<NodeGroup
				index={index}
				lit={lit}
				button={{ label: `Highlight ${nodeHeading(node)}`, pressed: pinned === node.model }}
			>
				<EngineMark
					positioned={positioned}
					color={node.model ? colors.get(node.model) : undefined}
					totalCitations={flow.totalCitations}
				/>
			</NodeGroup>
		);
	}
	if (node.kind === "section") {
		return (
			<NodeGroup index={index} lit={lit}>
				<SectionMark positioned={positioned} />
			</NodeGroup>
		);
	}
	const mark = (
		<NodeGroup
			index={index}
			lit={lit}
			button={node.kind === "more" && canExpand ? { label: "Show all pages" } : undefined}
		>
			<PageMark positioned={positioned} labelWidth={pageLabelWidth} />
		</NodeGroup>
	);
	if (node.kind === "more") return mark;
	return (
		<a
			href={node.url}
			target="_blank"
			rel="noreferrer"
			className="group focus-visible:outline-2 focus-visible:outline-ring"
			aria-label={`${node.title || node.name}, ${node.value.toLocaleString()} citations`}
		>
			{mark}
		</a>
	);
}

interface Band {
	key: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	width: number;
	target: number;
}

/** The engine bands between one section and one page sit side by side, so they draw as one band. */
function mergeBands(links: PositionedLink[]): Band[] {
	const merged = new Map<string, { links: PositionedLink[]; target: number }>();
	for (const positioned of links) {
		const key = `${positioned.link.source}-${positioned.link.target}`;
		const entry = merged.get(key) ?? { links: [], target: positioned.link.target };
		entry.links.push(positioned);
		merged.set(key, entry);
	}
	return [...merged].map(([key, entry]) => {
		const span = (centre: (l: PositionedLink) => number) => {
			const top = Math.min(...entry.links.map((l) => centre(l) - l.width / 2));
			const bottom = Math.max(...entry.links.map((l) => centre(l) + l.width / 2));
			return (top + bottom) / 2;
		};
		const { x0, x1 } = entry.links[0];
		return {
			key,
			x0,
			x1,
			y0: span((l) => l.y0),
			y1: span((l) => l.y1),
			width: entry.links.reduce((sum, l) => sum + l.width, 0),
			target: entry.target,
		};
	});
}

function FlowBands({
	flow,
	layout,
	colors,
	emphasis,
}: {
	flow: CitationFlow;
	layout: FlowLayout;
	colors: Map<string, string>;
	emphasis: Emphasis;
}) {
	const resting = emphasis.links === null;
	// At rest only the engine bands carry colour; past the sections the bands are structure, and
	// per-engine stripes there turn the chart into noise. Hovering or pinning brings the colour back.
	const neutral = ({ link }: PositionedLink) => {
		const source = flow.nodes[link.source];
		const target = flow.nodes[link.target];
		return resting && (source.kind === "section" || target.kind === "more" || Boolean(target.hiddenCount));
	};
	const coloured = layout.links.filter((positioned) => !neutral(positioned));
	const merged = mergeBands(layout.links.filter(neutral));
	return (
		<g fill="none">
			{merged.map((band) => (
				<path
					key={band.key}
					d={bandPath(band)}
					stroke="var(--muted-foreground)"
					strokeWidth={Math.max(band.width, 1)}
					strokeOpacity={0.14}
					data-node={band.target}
				/>
			))}
			{coloured.map((positioned) => {
				const lit = resting || emphasis.links?.has(positioned.index);
				return (
					<path
						key={positioned.index}
						d={bandPath(positioned)}
						stroke={colors.get(positioned.link.model)}
						strokeWidth={Math.max(positioned.width, 1)}
						strokeOpacity={resting ? 0.35 : lit ? 0.7 : 0.05}
						className="transition-[stroke-opacity] duration-150"
						data-link={positioned.index}
					/>
				);
			})}
		</g>
	);
}

export function FlowChart({
	flow,
	width,
	colors,
	focus,
	hovered,
	onHover,
	pinned,
	onPin,
	onExpand,
}: {
	flow: CitationFlow;
	width: number;
	colors: Map<string, string>;
	focus: Focus | null;
	hovered: Focus | null;
	onHover: (focus: Focus | null) => void;
	pinned: string | null;
	onPin: (model: string | null) => void;
	onExpand?: () => void;
}) {
	const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
	const layout = useFlowLayout(flow, width);
	const emphasis = useMemo(() => emphasisFor(flow, focus), [flow, focus]);
	const pageX = layout.columnX[layout.columnX.length - 1];
	const pageLabelWidth = layout.width - pageX - NODE_WIDTH - 8;
	const activate = (target: Focus | null) => {
		if (target?.type === "engine") onPin(pinned === target.model ? null : target.model);
		else if (target?.type === "node" && flow.nodes[target.index].kind === "more") onExpand?.();
		else if (!target) onPin(null);
	};

	return (
		<div className="relative">
			<svg
				width={layout.width}
				height={layout.height}
				className="block overflow-visible"
				onMouseMove={(event) => {
					const box = event.currentTarget.getBoundingClientRect();
					setPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
					const next = focusAt(flow, event.target);
					if (focusKey(next) !== focusKey(hovered)) onHover(next);
				}}
				onMouseLeave={() => {
					setPointer(null);
					onHover(null);
				}}
				onClick={(event) => activate(focusAt(flow, event.target))}
				onFocus={(event) => {
					const box = event.currentTarget.getBoundingClientRect();
					const mark = (event.target as Element).getBoundingClientRect();
					setPointer({ x: mark.right - box.left, y: mark.top + mark.height / 2 - box.top });
					onHover(focusAt(flow, event.target));
				}}
				onBlur={() => {
					setPointer(null);
					onHover(null);
				}}
				onKeyDown={(event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					const target = focusAt(flow, event.target);
					if (!target) return;
					event.preventDefault();
					activate(target);
				}}
			>
				<title>{`${flow.totalCitations} citations to ${flow.domain} from ${flow.engines.length} engines across ${flow.pageCount} pages`}</title>
				<g>
					<FlowBands flow={flow} layout={layout} colors={colors} emphasis={emphasis} />
					{layout.nodes.map((positioned) => (
						<FlowNodeMark
							key={positioned.node.id}
							positioned={positioned}
							flow={flow}
							colors={colors}
							lit={emphasis.nodes === null || emphasis.nodes.has(positioned.index)}
							pageLabelWidth={pageLabelWidth}
							pinned={pinned}
							canExpand={onExpand !== undefined}
						/>
					))}
				</g>
			</svg>
			{hovered && pointer && (
				<div
					className="pointer-events-none absolute z-10 grid w-max min-w-48 max-w-72 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
					style={{
						top: pointer.y + TOOLTIP_OFFSET,
						...(pointer.x > layout.width - TOOLTIP_MAX_WIDTH - TOOLTIP_OFFSET
							? { right: layout.width - pointer.x + TOOLTIP_OFFSET }
							: { left: pointer.x + TOOLTIP_OFFSET }),
					}}
				>
					<FlowTooltip flow={flow} focus={hovered} colors={colors} canExpand={onExpand !== undefined} />
				</div>
			)}
		</div>
	);
}
