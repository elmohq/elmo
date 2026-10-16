import { IconInfoCircle } from "@tabler/icons-react";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { type ChartConfig, ChartContainer } from "@workspace/ui/components/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import {
	Tooltip as ChartTooltip,
	Layer,
	Rectangle,
	Sankey,
	type SankeyLinkProps,
	type SankeyNodeProps,
} from "recharts";
import type { CitationStructure, CitationStructureLink, CitationStructureNode } from "@/lib/citation-structure";
import { OTHERS_COLOR } from "@/lib/company-colors";

const ROW_HEIGHT = 30;
const MIN_HEIGHT = 320;
const NODE_WIDTH = 10;
const NODE_PADDING = 10;
/** Engine labels sit left of the first column, page labels right of the last. */
const MARGIN = { top: 4, right: 250, bottom: 4, left: 112 };
const MIN_WIDTH = 820;
const MAX_PAGE_LABEL = 34;
const MAX_SECTION_LABEL = 26;

const DEPTH: Record<CitationStructureNode["kind"], number> = { engine: 0, section: 1, page: 2, more: 2 };

/**
 * Recharts stacks every column from the top, and the page column (most nodes,
 * most padding) is always the tallest, so the engine and section columns would
 * hug the top edge. Columns carry the same total, so their heights are known up
 * front and each can be centred on the page column.
 */
function columnOffsets(nodes: readonly CitationStructureNode[], innerHeight: number): number[] {
	const counts = [0, 0, 0];
	for (const node of nodes) counts[DEPTH[node.kind]] += 1;
	const total = nodes.filter((node) => node.kind === "engine").reduce((sum, node) => sum + node.value, 0);
	const yRatio = Math.min(...counts.map((n) => (innerHeight - (n - 1) * NODE_PADDING) / total));
	return counts.map((n) => (innerHeight - (total * yRatio + (n - 1) * NODE_PADDING)) / 2);
}

const engineLabel = (model: string) => getModelMeta(model).label;

function ellipsize(text: string, max: number) {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pct(value: number, total: number) {
	if (total <= 0) return "0%";
	const share = (value / total) * 100;
	return `${share < 1 ? share.toFixed(1) : Math.round(share)}%`;
}

/** Recharts spreads our node fields into its layout record; its typing only knows the geometry. */
type LaidOutNode = CitationStructureNode & SankeyNodeProps["payload"];
type LaidOutLink = CitationStructureLink & { source: LaidOutNode; target: LaidOutNode };

function StructureNode({
	x,
	y,
	width,
	height,
	payload,
	colors,
	total,
	highlight,
	onHighlight,
	offsets,
}: SankeyNodeProps & {
	offsets: number[];
	colors: Map<string, string>;
	total: number;
	highlight: string | null;
	onHighlight: (model: string | null) => void;
}) {
	const node = payload as LaidOutNode;
	y += offsets[DEPTH[node.kind]];
	const midY = y + height / 2;
	const dimmed = highlight !== null && !(node.byModel[highlight] > 0);
	const halo = { stroke: "var(--background)", strokeWidth: 3, strokeLinejoin: "round" as const, paintOrder: "stroke" };

	if (node.kind === "engine") {
		const model = node.model as string;
		return (
			<Layer
				onMouseEnter={() => onHighlight(model)}
				onMouseLeave={() => onHighlight(null)}
				opacity={dimmed ? 0.35 : 1}
				className="transition-opacity"
			>
				<Rectangle x={x} y={y} width={width} height={Math.max(height, 2)} fill={colors.get(model)} radius={2} />
				<text
					x={x - 8}
					y={midY - 6}
					textAnchor="end"
					dominantBaseline="middle"
					className="fill-foreground text-xs font-medium"
				>
					{engineLabel(model)}
				</text>
				<text
					x={x - 8}
					y={midY + 8}
					textAnchor="end"
					dominantBaseline="middle"
					className="fill-muted-foreground text-[11px] tabular-nums"
				>
					{node.value.toLocaleString()} · {pct(node.value, total)}
				</text>
			</Layer>
		);
	}

	const isMore = node.kind === "more";
	const fill = node.kind === "section" ? "var(--foreground)" : isMore ? OTHERS_COLOR : "var(--muted-foreground)";
	const maxLabel = node.kind === "section" ? MAX_SECTION_LABEL : MAX_PAGE_LABEL;
	const label = (
		<text x={x + width + 6} y={midY} dominantBaseline="middle" className="text-xs" style={halo}>
			<tspan
				className={cn(
					node.kind === "section" ? "fill-foreground font-medium" : "fill-foreground",
					isMore && "fill-muted-foreground italic",
				)}
			>
				{ellipsize(node.name, maxLabel)}
			</tspan>
			<tspan dx={6} className="fill-muted-foreground tabular-nums">
				{node.value.toLocaleString()}
			</tspan>
		</text>
	);

	return (
		<Layer opacity={dimmed ? 0.35 : 1} className="transition-opacity">
			<Rectangle
				x={x}
				y={y}
				width={width}
				height={Math.max(height, 2)}
				fill={fill}
				fillOpacity={node.kind === "section" ? 0.75 : 0.55}
				radius={2}
			/>
			{node.kind === "page" && node.url ? (
				<a href={node.url} target="_blank" rel="noreferrer" className="hover:underline">
					{label}
				</a>
			) : (
				label
			)}
		</Layer>
	);
}

function StructureLink({
	sourceX,
	sourceY,
	sourceControlX,
	targetX,
	targetY,
	targetControlX,
	linkWidth,
	payload,
	colors,
	highlight,
	offsets,
}: SankeyLinkProps & { colors: Map<string, string>; highlight: string | null; offsets: number[] }) {
	const link = payload as unknown as LaidOutLink;
	sourceY += offsets[DEPTH[link.source.kind]];
	targetY += offsets[DEPTH[link.target.kind]];
	const opacity = highlight === null ? 0.32 : highlight === link.model ? 0.6 : 0.05;
	return (
		<path
			d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
			fill="none"
			stroke={colors.get(link.model)}
			strokeOpacity={opacity}
			strokeWidth={Math.max(linkWidth, 1)}
			// Translucent bands read muddier on a dark surface, so they get more ink there.
			className={cn("transition-[stroke-opacity]", highlight === null && "dark:[stroke-opacity:0.45]")}
		/>
	);
}

function EngineBreakdown({
	byModel,
	engines,
	colors,
}: {
	byModel: Record<string, number>;
	engines: CitationStructure["engines"];
	colors: Map<string, string>;
}) {
	const rows = engines.filter((engine) => byModel[engine.model] > 0);
	const total = rows.reduce((sum, engine) => sum + byModel[engine.model], 0);
	return (
		<div className="grid gap-1">
			{rows.map(({ model }) => (
				<div key={model} className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.get(model) }} />
					<span className="text-muted-foreground">{engineLabel(model)}</span>
					<span className="ml-auto pl-4 font-mono tabular-nums">{byModel[model].toLocaleString()}</span>
					<span className="w-9 text-right text-muted-foreground tabular-nums">{pct(byModel[model], total)}</span>
				</div>
			))}
		</div>
	);
}

interface TooltipItem {
	payload: { payload: LaidOutNode | LaidOutLink };
}

const TOOLTIP_CLASS =
	"border-border/50 bg-background grid min-w-[13rem] max-w-sm gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl";

/** A node's own name for headings: the engine's label, a page's title, or the section host. */
function nodeHeading(node: LaidOutNode): string {
	if (node.kind === "engine") return engineLabel(node.model as string);
	if (node.kind === "page") return node.title ?? node.name;
	return node.name;
}

function LinkTooltip({ link, colors }: { link: LaidOutLink; colors: Map<string, string> }) {
	const fromEngine = link.source.kind === "engine";
	return (
		<div className={TOOLTIP_CLASS}>
			<div className="flex items-center gap-2">
				<span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: colors.get(link.model) }} />
				<span className="font-medium">{engineLabel(link.model)}</span>
			</div>
			<div className="text-muted-foreground break-words">
				{fromEngine ? nodeHeading(link.target) : `${link.source.name} → ${nodeHeading(link.target)}`}
			</div>
			<div className="tabular-nums">
				{link.value.toLocaleString()} citations · {pct(link.value, link.target.value)} of this{" "}
				{link.target.kind === "section" ? "section" : "page"}
			</div>
		</div>
	);
}

function NodeTooltip({
	node,
	engines,
	colors,
	total,
}: {
	node: LaidOutNode;
	engines: CitationStructure["engines"];
	colors: Map<string, string>;
	total: number;
}) {
	return (
		<div className={TOOLTIP_CLASS}>
			<div className="font-medium break-words">{nodeHeading(node)}</div>
			{node.url && <div className="text-muted-foreground break-all">{node.url.replace(/^https?:\/\//, "")}</div>}
			<div className="tabular-nums">
				{node.value.toLocaleString()} citations · {pct(node.value, total)} of citations to your site
			</div>
			{node.kind !== "engine" && <EngineBreakdown byModel={node.byModel} engines={engines} colors={colors} />}
		</div>
	);
}

function StructureTooltip({
	active,
	payload,
	...rest
}: {
	active?: boolean;
	payload?: TooltipItem[];
	engines: CitationStructure["engines"];
	colors: Map<string, string>;
	total: number;
}) {
	const item = payload?.[0]?.payload?.payload;
	if (!active || !item) return null;
	if ("source" in item && typeof item.source === "object") {
		return <LinkTooltip link={item as LaidOutLink} colors={rest.colors} />;
	}
	return <NodeTooltip node={item as LaidOutNode} {...rest} />;
}

export function CitationStructureCard({
	structure,
	brandName,
	chartColors,
	allCitations,
}: {
	structure: CitationStructure;
	brandName?: string;
	chartColors: readonly string[];
	/** Every citation in the window, so the header can say what share lands on the brand's own site. */
	allCitations?: number;
}) {
	const [highlight, setHighlight] = useState<string | null>(null);
	const { nodes, links, engines, totalCitations, pageCount } = structure;

	// Engines are already in the brand's model order, so a model keeps its colour across filters.
	const colors = useMemo(
		() => new Map(engines.map(({ model }, i) => [model, chartColors[i] ?? OTHERS_COLOR])),
		[engines, chartColors],
	);
	const config = useMemo<ChartConfig>(
		() =>
			Object.fromEntries(engines.map(({ model }) => [model, { label: engineLabel(model), color: colors.get(model) }])),
		[engines, colors],
	);
	const sectionCount = nodes.filter((node) => node.kind === "section").length;
	const rows = Math.max(
		nodes.filter((node) => node.kind === "page" || node.kind === "more").length,
		engines.length * 2,
	);
	const height = Math.max(MIN_HEIGHT, rows * ROW_HEIGHT);
	const offsets = useMemo(
		() => (totalCitations > 0 ? columnOffsets(nodes, height - MARGIN.top - MARGIN.bottom) : [0, 0, 0]),
		[nodes, height, totalCitations],
	);

	return (
		<Card className="gap-4">
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 space-y-1">
						<CardTitle className="flex items-center gap-1.5">
							Citation Structure
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-sm font-normal">
									<p className="mb-2">
										Every citation of {brandName ?? "your brand"}&apos;s own website, followed from the AI engine that
										cited it, through the part of your site it points into, to the exact page.
									</p>
									<p>
										Subdomains are their own section; on your main domain each top-level folder is one. Your website and
										additional domains come from Brand settings.
									</p>
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>Which engines cite your site, and which of your pages they cite.</CardDescription>
					</div>
					{totalCitations > 0 && (
						<dl className="flex shrink-0 gap-6 text-right">
							<div>
								<dt className="text-xs text-muted-foreground">Citations to your site</dt>
								<dd className="text-lg font-semibold tabular-nums">{totalCitations.toLocaleString()}</dd>
							</div>
							{allCitations !== undefined && allCitations > 0 && (
								<div>
									<dt className="text-xs text-muted-foreground">Of all citations</dt>
									<dd className="text-lg font-semibold tabular-nums">{pct(totalCitations, allCitations)}</dd>
								</div>
							)}
							<div>
								<dt className="text-xs text-muted-foreground">Pages cited</dt>
								<dd className="text-lg font-semibold tabular-nums">{pageCount.toLocaleString()}</dd>
							</div>
						</dl>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{totalCitations === 0 ? (
					<div className="py-10 text-center text-sm text-muted-foreground">
						No AI answers cited your website in this period. Pages appear here once an engine links to one of your
						domains.
					</div>
				) : (
					<>
						<ul className="mb-4 flex flex-wrap gap-1.5" aria-label="Engines">
							{engines.map(({ model, count }) => (
								<li key={model}>
									<button
										type="button"
										onMouseEnter={() => setHighlight(model)}
										onMouseLeave={() => setHighlight(null)}
										onFocus={() => setHighlight(model)}
										onBlur={() => setHighlight(null)}
										className={cn(
											"flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-opacity",
											highlight !== null && highlight !== model && "opacity-40",
										)}
									>
										<span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: colors.get(model) }} />
										<ModelIcon iconId={getModelMeta(model).iconId} className="size-3.5" />
										<span className="font-medium">{engineLabel(model)}</span>
										<span className="text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
									</button>
								</li>
							))}
						</ul>
						<div className="overflow-x-auto">
							<figure
								style={{ minWidth: MIN_WIDTH }}
								aria-label={`${totalCitations} citations of your site from ${engines.length} engines across ${sectionCount} sections and ${pageCount} pages`}
							>
								<div className="mb-1 grid grid-cols-[112px_1fr_1fr_250px] text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
									<span className="pr-2 text-right">Engine</span>
									<span />
									<span className="-ml-1">Section</span>
									<span className="-ml-3">Page</span>
								</div>
								<ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
									<Sankey
										data={{ nodes, links }}
										nodeWidth={NODE_WIDTH}
										nodePadding={NODE_PADDING}
										margin={MARGIN}
										sort={false}
										verticalAlign="top"
										node={(props) => (
											<StructureNode
												{...props}
												colors={colors}
												total={totalCitations}
												highlight={highlight}
												offsets={offsets}
												onHighlight={setHighlight}
											/>
										)}
										link={(props) => (
											<StructureLink {...props} colors={colors} highlight={highlight} offsets={offsets} />
										)}
									>
										<ChartTooltip
											isAnimationActive={false}
											content={<StructureTooltip engines={engines} colors={colors} total={totalCitations} />}
										/>
									</Sankey>
								</ChartContainer>
							</figure>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
