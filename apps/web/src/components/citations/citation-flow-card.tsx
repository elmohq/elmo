import { IconInfoCircle } from "@tabler/icons-react";
import { getModelMeta } from "@workspace/config/models";
import { CATEGORY_CONFIG } from "@workspace/lib/citations/domain-categories";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
	Combobox,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxGroup,
	ComboboxInput,
	ComboboxItem,
	ComboboxLabel,
	ComboboxList,
	ComboboxTrigger,
} from "@workspace/ui/components/combobox";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { SiteIcon } from "@/components/site-icon";
import {
	buildCitationFlow,
	type CitationFlow,
	type CitationFlowNode,
	type CitationFlowRow,
	DEFAULT_FLOW_LIMITS,
	type FlowDomainOption,
	flowHeadline,
	matchesDomain,
	TOP_LEVEL,
} from "@/lib/citation-flow";
import {
	type FlowLayout,
	layoutCitationFlow,
	type PositionedLink,
	type PositionedNode,
} from "@/lib/citation-flow-layout";
import { OTHERS_COLOR, useChartColors } from "@/lib/company-colors";

export const CITATION_FLOW_ID = "citation-flow";

/** Every page up to this many; past it the tail still folds, so the chart stays a chart. */
const EXPANDED_PAGES = 50;
/** Below this width three columns of labels can't share a row, so the flow becomes a ranked list. */
const MIN_CHART_WIDTH = 640;
const NODE_WIDTH = 8;
const HEADER_HEIGHT = 22;
const FONT = "12px ui-sans-serif, system-ui, sans-serif";

const engineLabel = (model: string) => getModelMeta(model).label;

function pct(value: number, total: number) {
	if (total <= 0) return "0%";
	const share = (value / total) * 100;
	return `${share > 0 && share < 1 ? "<1" : Math.round(share)}%`;
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

function useElementWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, width] as const;
}

/** What the pointer is on: an engine (from its node or the legend), a node, or one band. */
type Focus = { type: "engine"; model: string } | { type: "node"; index: number } | { type: "link"; index: number };

interface Emphasis {
	links: Set<number> | null;
	nodes: Set<number> | null;
}

/** Which bands and nodes stay lit for a focus; null means everything is. */
function emphasisFor(flow: CitationFlow, focus: Focus | null): Emphasis {
	if (!focus) return { links: null, nodes: null };
	const links = new Set<number>();
	const nodes = new Set<number>();
	const light = (i: number) => {
		links.add(i);
		nodes.add(flow.links[i].source);
		nodes.add(flow.links[i].target);
	};
	if (focus.type === "engine") {
		for (const [i, link] of flow.links.entries()) if (link.model === focus.model) light(i);
	} else if (focus.type === "link") {
		light(focus.index);
	} else {
		const node = flow.nodes[focus.index];
		nodes.add(focus.index);
		flow.links.forEach((link, i) => {
			if (link.source === focus.index || link.target === focus.index) light(i);
		});
		// The engines behind a page stay lit, but not their whole bands into the
		// section: those carry every page in it and would overstate this one.
		flow.nodes.forEach((other, i) => {
			if (other.kind === "engine" && node.byModel[other.model as string]) nodes.add(i);
		});
	}
	return { links, nodes };
}

function bandPath({ x0, y0, x1, y1 }: PositionedLink) {
	const mid = (x0 + x1) / 2;
	return `M${x0},${y0}C${mid},${y0} ${mid},${y1} ${x1},${y1}`;
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
					<span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.get(model) }} />
					<span className="text-muted-foreground">{engineLabel(model)}</span>
					<span className="ml-auto pl-4 tabular-nums">{byModel[model].toLocaleString()}</span>
					<span className="w-9 text-right text-muted-foreground tabular-nums">{pct(byModel[model], total)}</span>
				</div>
			))}
		</div>
	);
}

function nodeHeading(node: CitationFlowNode): string {
	if (node.kind === "engine") return engineLabel(node.model as string);
	if (node.kind === "page") return node.title || node.name;
	return node.name;
}

function FlowTooltip({ flow, focus, colors }: { flow: CitationFlow; focus: Focus; colors: Map<string, string> }) {
	if (focus.type === "link") {
		const link = flow.links[focus.index];
		const source = flow.nodes[link.source];
		const target = flow.nodes[link.target];
		return (
			<>
				<div className="flex items-center gap-2">
					<span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.get(link.model) }} />
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
		flow.nodes[focus.type === "node" ? focus.index : (flow.engines.findIndex((e) => e.model === focus.model) ?? 0)];
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
			{node.kind === "more" && <div className="text-muted-foreground">Show all pages to list them</div>}
		</>
	);
}

interface ChartProps {
	flow: CitationFlow;
	layout: FlowLayout;
	colors: Map<string, string>;
	focus: Focus | null;
	onFocus: (focus: Focus | null) => void;
}

/** What a hovered element stands for, read from the data attributes the marks carry. */
function focusAt(flow: CitationFlow, target: EventTarget | null): Focus | null {
	const mark = target instanceof Element ? target.closest<SVGElement>("[data-link],[data-node]") : null;
	if (!mark) return null;
	if (mark.dataset.link !== undefined) return { type: "link", index: Number(mark.dataset.link) };
	const index = Number(mark.dataset.node);
	const node = flow.nodes[index];
	return node.kind === "engine" ? { type: "engine", model: node.model as string } : { type: "node", index };
}

const sameFocus = (a: Focus | null, b: Focus | null) => JSON.stringify(a) === JSON.stringify(b);

function FlowNodeMark({
	positioned,
	layout,
	flow,
	colors,
	lit,
	pageLabelWidth,
}: Omit<ChartProps, "focus" | "onFocus"> & { positioned: PositionedNode; lit: boolean; pageLabelWidth: number }) {
	const { node, x, y, height, index } = positioned;
	const midY = y + height / 2;
	const isLast = positioned.column === layout.columnX.length - 1;
	const drawnHeight = Math.max(height, 2);
	// The chart reads this to know what the pointer is on.
	const hover = { "data-node": index };
	const fade = { opacity: lit ? 1 : 0.3, className: "transition-opacity duration-150" };

	if (node.kind === "engine") {
		const model = node.model as string;
		return (
			<g {...hover} {...fade}>
				<rect x={x} y={y} width={NODE_WIDTH} height={drawnHeight} rx={2} fill={colors.get(model)} />
				<text
					x={x - 10}
					y={midY - 7}
					textAnchor="end"
					dominantBaseline="middle"
					className="fill-foreground text-xs font-medium"
				>
					{engineLabel(model)}
				</text>
				<text
					x={x - 10}
					y={midY + 8}
					textAnchor="end"
					dominantBaseline="middle"
					className="fill-muted-foreground text-[11px] tabular-nums"
				>
					{node.value.toLocaleString()} · {pct(node.value, flow.totalCitations)}
				</text>
				{/* A label-sized hit target, so a two-citation engine is still easy to hover. */}
				<rect x={x - 110} y={midY - 16} width={110 + NODE_WIDTH} height={32} fill="transparent" />
			</g>
		);
	}

	const nodeRect = (
		<rect
			x={x}
			y={y}
			width={NODE_WIDTH}
			height={drawnHeight}
			rx={2}
			className={node.kind === "section" ? "fill-muted-foreground/60" : "fill-muted-foreground/35"}
		/>
	);

	if (!isLast) {
		// Section labels sit on a surface-coloured chip so they read over the bands leaving them.
		const count = node.value.toLocaleString();
		const nameWidth = textWidth(node.name, `500 ${FONT}`);
		const chipWidth = nameWidth + textWidth(count) + 22;
		const chipX = x + NODE_WIDTH + 6;
		return (
			<g {...hover} {...fade}>
				{nodeRect}
				<rect
					x={chipX}
					y={midY - 10}
					width={chipWidth}
					height={20}
					rx={5}
					className="fill-card/90 stroke-border"
					strokeWidth={1}
				/>
				<text x={chipX + 8} y={midY + 0.5} dominantBaseline="middle" className="text-xs">
					<tspan className={cn("fill-foreground font-medium", node.hiddenCount && "fill-muted-foreground")}>
						{node.name}
					</tspan>
					<tspan dx={6} className="fill-muted-foreground tabular-nums">
						{count}
					</tspan>
				</text>
			</g>
		);
	}

	const count = node.value.toLocaleString();
	const isMore = node.kind === "more";
	const labelText = isMore ? `+ ${node.name}` : node.name;
	const label = (
		<text x={x + NODE_WIDTH + 8} y={midY + 0.5} dominantBaseline="middle" className="text-xs">
			<tspan className={cn(isMore ? "fill-muted-foreground" : "fill-foreground group-hover:underline")}>
				{fitText(labelText, pageLabelWidth - textWidth(count) - 8)}
			</tspan>
			<tspan dx={6} className="fill-muted-foreground tabular-nums">
				{count}
			</tspan>
		</text>
	);
	// The whole row is the target: node, label and the space between.
	const hit = <rect x={x} y={midY - 10} width={pageLabelWidth + NODE_WIDTH + 8} height={20} fill="transparent" />;

	if (isMore) {
		return (
			<g {...hover} {...fade}>
				{nodeRect}
				{label}
				{hit}
			</g>
		);
	}
	return (
		<a
			href={node.url}
			target="_blank"
			rel="noreferrer"
			className="group outline-none"
			aria-label={`${node.title || node.name}, ${count} citations`}
		>
			<g {...hover} {...fade}>
				{nodeRect}
				{label}
				{hit}
			</g>
		</a>
	);
}

function FlowChart({
	flow,
	layout,
	colors,
	focus,
	onFocus,
	onPointer,
}: ChartProps & { onPointer: (pointer: { x: number; y: number } | null) => void }) {
	const emphasis = useMemo(() => emphasisFor(flow, focus), [flow, focus]);
	const pageX = layout.columnX[layout.columnX.length - 1];
	const pageLabelWidth = layout.width - pageX - NODE_WIDTH - 8;
	const headers = flow.showSections ? ["Engine", "Section", "Page"] : ["Engine", "Page"];

	return (
		<svg
			width={layout.width}
			height={layout.height + HEADER_HEIGHT}
			role="img"
			aria-label={`${flow.totalCitations} citations to ${flow.domain} from ${flow.engines.length} engines across ${flow.pageCount} pages`}
			className="block overflow-visible"
			onMouseMove={(event) => {
				const box = event.currentTarget.getBoundingClientRect();
				onPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
				const next = focusAt(flow, event.target);
				if (!sameFocus(next, focus)) onFocus(next);
			}}
			onMouseLeave={() => {
				onPointer(null);
				onFocus(null);
			}}
		>
			<g className="fill-muted-foreground text-[11px] font-medium">
				{headers.map((header, i) => (
					<text
						key={header}
						x={i === 0 ? layout.columnX[0] - 10 : layout.columnX[i] + NODE_WIDTH + (i === headers.length - 1 ? 8 : 6)}
						y={10}
						textAnchor={i === 0 ? "end" : "start"}
					>
						{header}
					</text>
				))}
			</g>
			<g transform={`translate(0, ${HEADER_HEIGHT})`}>
				<g fill="none">
					{layout.links.map((positioned) => {
						const lit = emphasis.links === null || emphasis.links.has(positioned.index);
						// The fold isn't the story: its bands stay neutral so they don't pull the eye across the chart.
						const intoFold = flow.nodes[positioned.link.target].kind === "more";
						return (
							<path
								key={positioned.index}
								d={bandPath(positioned)}
								stroke={
									intoFold && !(lit && emphasis.links) ? "var(--muted-foreground)" : colors.get(positioned.link.model)
								}
								strokeWidth={Math.max(positioned.width, 1)}
								strokeOpacity={emphasis.links === null ? undefined : lit ? 0.7 : 0.05}
								className={cn(
									"transition-[stroke-opacity] duration-150",
									emphasis.links === null &&
										(intoFold
											? "[stroke-opacity:0.12] dark:[stroke-opacity:0.14]"
											: "[stroke-opacity:0.32] dark:[stroke-opacity:0.3]"),
								)}
								data-link={positioned.index}
							/>
						);
					})}
				</g>
				{layout.nodes.map((positioned) => (
					<FlowNodeMark
						key={positioned.node.id}
						positioned={positioned}
						layout={layout}
						flow={flow}
						colors={colors}
						lit={emphasis.nodes === null || emphasis.nodes.has(positioned.index)}
						pageLabelWidth={pageLabelWidth}
					/>
				))}
			</g>
		</svg>
	);
}

/** The narrow-screen form: the same pages, ranked, each bar split by engine. */
function FlowList({
	flow,
	colors,
	focusModel,
	onExpand,
}: {
	flow: CitationFlow;
	colors: Map<string, string>;
	focusModel: string | null;
	onExpand: () => void;
}) {
	const pages = flow.nodes.filter((node) => node.kind === "page");
	const more = flow.nodes.find((node) => node.kind === "more");
	const sectionOf = new Map<number, string>();
	for (const link of flow.links) {
		const source = flow.nodes[link.source];
		if (source.kind === "section") sectionOf.set(link.target, source.name);
	}
	const max = Math.max(...pages.map((page) => page.value), 1);
	return (
		<ol className="space-y-3">
			{pages.map((page) => {
				const index = flow.nodes.indexOf(page);
				return (
					<li key={page.id} className="space-y-1.5">
						<div className="flex items-baseline gap-2 text-sm">
							<a
								href={page.url}
								target="_blank"
								rel="noreferrer"
								className="min-w-0 truncate font-medium hover:underline"
							>
								{page.name}
							</a>
							{sectionOf.has(index) && (
								<span className="shrink-0 truncate text-xs text-muted-foreground">{sectionOf.get(index)}</span>
							)}
							<span className="ml-auto shrink-0 tabular-nums">{page.value.toLocaleString()}</span>
						</div>
						<div className="flex h-1.5 gap-0.5" style={{ width: `${(page.value / max) * 100}%` }}>
							{flow.engines.map(({ model }) =>
								page.byModel[model] ? (
									<span
										key={model}
										className="h-full rounded-full transition-opacity first:rounded-l-full"
										style={{
											flexGrow: page.byModel[model],
											backgroundColor: colors.get(model),
											opacity: focusModel && focusModel !== model ? 0.2 : 1,
										}}
										title={`${engineLabel(model)}: ${page.byModel[model]}`}
									/>
								) : null,
							)}
						</div>
					</li>
				);
			})}
			{more && (
				<li>
					<button type="button" onClick={onExpand} className="text-sm text-muted-foreground hover:text-foreground">
						+ {more.name} · {more.value.toLocaleString()} citations
					</button>
				</li>
			)}
		</ol>
	);
}

function DomainPicker({
	domains,
	value,
	onChange,
}: {
	domains: readonly FlowDomainOption[];
	value: string | undefined;
	onChange: (domain: string) => void;
}) {
	const groups = useMemo(() => {
		// A listed domain's subdomains sit right under it, so docs.acme.com reads as part of acme.com.
		const nested = (items: FlowDomainOption[]) => {
			const parentOf = (d: FlowDomainOption) =>
				items.find(
					(other) => other !== d && matchesDomain(d.domain, other.domain) && !matchesDomain(other.domain, d.domain),
				);
			const roots = items.filter((d) => !parentOf(d));
			return roots.flatMap((rootOption) => [
				rootOption,
				...items.filter((d) => d !== rootOption && matchesDomain(d.domain, rootOption.domain)),
			]);
		};
		const brand = nested(domains.filter((d) => d.category === "brand"));
		const competitor = nested(domains.filter((d) => d.category === "competitor"));
		const other = nested(domains.filter((d) => d.category !== "brand" && d.category !== "competitor"));
		return [
			{ value: "Your brand", items: brand },
			{ value: "Competitors", items: competitor },
			{ value: "Other sources", items: other },
		].filter((group) => group.items.length > 0);
	}, [domains]);
	const selected = domains.find((d) => d.domain === value) ?? null;

	return (
		<Combobox
			items={groups}
			value={selected}
			onValueChange={(next: FlowDomainOption | null) => next && onChange(next.domain)}
			itemToStringLabel={(item: FlowDomainOption) => item.domain}
			isItemEqualToValue={(a: FlowDomainOption, b: FlowDomainOption) => a.domain === b.domain}
		>
			<ComboboxTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="w-full min-w-0 justify-between gap-2 font-normal sm:w-64"
						aria-label="Domain to analyze"
					/>
				}
			>
				<span className="flex min-w-0 items-center gap-2">
					<SiteIcon domain={value} size="xs" />
					<span className="truncate font-medium">{value ?? "Choose a domain"}</span>
				</span>
			</ComboboxTrigger>
			<ComboboxContent align="end" className="w-80">
				<ComboboxInput showTrigger={false} placeholder="Search domains…" />
				<ComboboxEmpty>No cited domains match.</ComboboxEmpty>
				<ComboboxList>
					{(group: (typeof groups)[number]) => (
						<ComboboxGroup key={group.value} items={group.items}>
							<ComboboxLabel>{group.value}</ComboboxLabel>
							<ComboboxCollection>
								{(item: FlowDomainOption) => (
									<ComboboxItem
										key={item.domain}
										value={item}
										className={cn(domains.some((d) => d !== item && matchesDomain(item.domain, d.domain)) && "pl-8")}
									>
										<SiteIcon domain={item.domain} size="xs" />
										<span className="min-w-0 truncate">{item.domain}</span>
										{item.category !== "brand" && item.category !== "competitor" && (
											<span className="shrink-0 text-xs text-muted-foreground">
												{CATEGORY_CONFIG[item.category]?.label}
											</span>
										)}
										<span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground tabular-nums">
											{item.count.toLocaleString()}
										</span>
									</ComboboxItem>
								)}
							</ComboboxCollection>
						</ComboboxGroup>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}

/** The leading engine's story, or the highlighted engine's while one is. */
function Headline({ flow, model }: { flow: CitationFlow; model: string | null }) {
	const headline = flowHeadline(flow, model ?? undefined);
	if (!headline || flow.totalCitations < 2) return null;
	const engine = <span className="font-medium text-foreground">{engineLabel(headline.model)}</span>;
	const focus = (
		<span className="font-medium text-foreground">
			{headline.focus === TOP_LEVEL ? "top-level pages" : headline.focus}
		</span>
	);
	return (
		<p className="text-sm text-muted-foreground">
			{headline.soleEngine ? (
				<>
					Every citation to {flow.domain} comes from {engine}
				</>
			) : (
				<>
					{engine} {model ? "accounts for" : "drives"}{" "}
					<span className="font-medium text-foreground tabular-nums">{headline.share}%</span> of citations to{" "}
					{flow.domain}
				</>
			)}
			{headline.focusShare < 100 || flow.pageCount > 1 ? (
				<>
					; {headline.focusShare}% of {headline.soleEngine ? "them" : "its citations"} go to {focus}.
				</>
			) : (
				"."
			)}
		</p>
	);
}

function Placeholder({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
			{children}
		</div>
	);
}

/** Engines keep the colour of their place in the brand's model order, whichever are in view. */
function useEngineColors(flow: CitationFlow | undefined, modelOrder: readonly string[]) {
	const chartColors = useChartColors();
	return useMemo(() => {
		const map = new Map<string, string>();
		let next = modelOrder.length;
		for (const { model } of flow?.engines ?? []) {
			const rank = modelOrder.indexOf(model);
			map.set(model, chartColors[rank >= 0 ? rank : next++] ?? OTHERS_COLOR);
		}
		return map;
	}, [flow, modelOrder, chartColors]);
}

function useFlowLayout(flow: CitationFlow, width: number) {
	return useMemo(() => {
		if (width < MIN_CHART_WIDTH) return undefined;
		const leftGutter =
			Math.max(...flow.engines.map(({ model }) => textWidth(engineLabel(model), `500 ${FONT}`)), 60) + 18;
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

function EngineLegend({
	flow,
	colors,
	pinned,
	focusModel,
	onPin,
	onHover,
}: {
	flow: CitationFlow;
	colors: Map<string, string>;
	pinned: string | null;
	focusModel: string | null;
	onPin: (model: string | null) => void;
	onHover: (focus: Focus | null) => void;
}) {
	return (
		<ul className="flex flex-wrap gap-1" aria-label="Engines">
			{flow.engines.map(({ model, count }) => (
				<li key={model}>
					<button
						type="button"
						aria-pressed={pinned === model}
						onClick={() => onPin(pinned === model ? null : model)}
						onMouseEnter={() => onHover({ type: "engine", model })}
						onMouseLeave={() => onHover(null)}
						onFocus={() => onHover({ type: "engine", model })}
						onBlur={() => onHover(null)}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-[opacity,background-color] hover:bg-muted aria-pressed:bg-muted",
							focusModel !== null && focusModel !== model && "opacity-40",
						)}
					>
						<span className="size-2.5 rounded-[2px]" style={{ backgroundColor: colors.get(model) }} />
						<ModelIcon iconId={getModelMeta(model).iconId} className="size-3.5" />
						<span className="font-medium">{engineLabel(model)}</span>
						<span className="text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
					</button>
				</li>
			))}
		</ul>
	);
}

/** A domain with citations: the headline, the legend, and the chart (or the ranked list when narrow). */
function FlowView({
	flow,
	width,
	modelOrder,
	expanded,
	onExpandedChange,
}: {
	flow: CitationFlow;
	width: number;
	modelOrder: readonly string[];
	expanded: boolean;
	onExpandedChange: (expanded: boolean) => void;
}) {
	const [hover, setHover] = useState<Focus | null>(null);
	const [pinned, setPinned] = useState<string | null>(null);
	const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
	const colors = useEngineColors(flow, modelOrder);
	const layout = useFlowLayout(flow, width);

	const focusModel = hover?.type === "engine" ? hover.model : pinned;
	const focus: Focus | null = hover ?? (pinned ? { type: "engine", model: pinned } : null);
	const hiddenPages = flow.nodes.find((node) => node.kind === "more")?.hiddenCount ?? 0;
	const shownPages = flow.nodes.filter((node) => node.kind === "page").length;

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 @2xl/flow:flex-row @2xl/flow:items-start @2xl/flow:justify-between">
				<Headline flow={flow} model={focusModel} />
				<p className="shrink-0 text-xs text-muted-foreground tabular-nums">
					{flow.totalCitations.toLocaleString()} citations
					{flow.showSections && ` · ${flow.sectionCount} sections`} · {flow.pageCount}{" "}
					{flow.pageCount === 1 ? "page" : "pages"}
				</p>
			</div>
			<EngineLegend
				flow={flow}
				colors={colors}
				pinned={pinned}
				focusModel={focusModel}
				onPin={setPinned}
				onHover={setHover}
			/>
			{layout ? (
				<div className="relative">
					<FlowChart
						flow={flow}
						layout={layout}
						colors={colors}
						focus={focus}
						onFocus={setHover}
						onPointer={setPointer}
					/>
					{hover && pointer && (
						<div
							className="pointer-events-none absolute z-10 grid w-max min-w-48 max-w-72 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
							style={{
								top: pointer.y + 14,
								...(pointer.x > layout.width - 300
									? { right: layout.width - pointer.x + 14 }
									: { left: pointer.x + 14 }),
							}}
						>
							<FlowTooltip flow={flow} focus={hover} colors={colors} />
						</div>
					)}
				</div>
			) : (
				<FlowList flow={flow} colors={colors} focusModel={focusModel} onExpand={() => onExpandedChange(true)} />
			)}
			{(hiddenPages > 0 || expanded) && flow.pageCount > DEFAULT_FLOW_LIMITS.maxPages && (
				<div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
					<span className="tabular-nums">
						Showing {shownPages} of {flow.pageCount} pages
					</span>
					<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onExpandedChange(!expanded)}>
						{expanded ? `Show top ${DEFAULT_FLOW_LIMITS.maxPages}` : `Show all ${flow.pageCount} pages`}
					</Button>
				</div>
			)}
		</div>
	);
}

export function CitationFlowCard({
	domains,
	domain,
	onDomainChange,
	rows,
	isLoading = false,
	modelOrder = [],
}: {
	/** Cited domains under the page's filters, most cited first. */
	domains: readonly FlowDomainOption[];
	domain: string | undefined;
	onDomainChange: (domain: string) => void;
	/** Undefined while the first load for this domain is in flight. */
	rows: readonly CitationFlowRow[] | undefined;
	/** True while rows are being refreshed for a filter change. */
	isLoading?: boolean;
	/** The brand's tracked models, so an engine keeps its colour whatever the filter. */
	modelOrder?: readonly string[];
}) {
	const [expanded, setExpanded] = useState(false);
	const [containerRef, width] = useElementWidth<HTMLDivElement>();

	// A new domain starts collapsed.
	const [shownDomain, setShownDomain] = useState(domain);
	if (shownDomain !== domain) {
		setShownDomain(domain);
		setExpanded(false);
	}

	const flow = useMemo(
		() =>
			rows && domain
				? buildCitationFlow({
						rows,
						domain,
						modelOrder,
						limits: expanded ? { maxPages: EXPANDED_PAGES } : DEFAULT_FLOW_LIMITS,
					})
				: undefined,
		[rows, domain, modelOrder, expanded],
	);

	let body: ReactNode;
	if (!domain) body = <Placeholder>Choose a domain to see how AI engines cite it.</Placeholder>;
	else if (!flow) body = <Skeleton className="h-72 w-full" />;
	else if (flow.totalCitations === 0)
		body = <Placeholder>No AI answers cited {domain} under the current filters.</Placeholder>;
	else
		body = (
			<FlowView flow={flow} width={width} modelOrder={modelOrder} expanded={expanded} onExpandedChange={setExpanded} />
		);

	return (
		<Card id={CITATION_FLOW_ID} className="scroll-mt-4 gap-4">
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0 space-y-1">
						<CardTitle className="flex items-center gap-1.5">
							Citation Flow
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground" />} />
								<TooltipContent className="max-w-xs text-sm font-normal">
									<p className="mb-2">
										Every citation of one domain, followed from the AI engine that cited it, through the part of the
										site it points into, to the exact page. Pick your own site, a competitor or any source.
									</p>
									<p>
										Subdomains are their own section; on the domain itself each top-level folder is one. Respects the
										filters at the top of the page.
									</p>
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>Which engines cite a domain, and which of its pages they cite</CardDescription>
					</div>
					<DomainPicker domains={domains} value={domain} onChange={onDomainChange} />
				</div>
			</CardHeader>
			<Separator />
			<CardContent>
				<div ref={containerRef} className={cn("@container/flow transition-opacity", isLoading && flow && "opacity-60")}>
					{body}
				</div>
			</CardContent>
		</Card>
	);
}
