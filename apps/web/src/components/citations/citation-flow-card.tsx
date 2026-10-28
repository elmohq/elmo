import { IconInfoCircle } from "@tabler/icons-react";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useMemo, useState } from "react";
import {
	EngineSwatch,
	engineLabel,
	FlowChart,
	type Focus,
	MIN_CHART_WIDTH,
} from "@/components/citations/citation-flow-chart";
import { DomainPicker } from "@/components/citations/citation-flow-domain-picker";
import { useElementWidth } from "@/hooks/use-element-width";
import {
	buildCitationFlow,
	type CitationFlow,
	type CitationFlowRow,
	DEFAULT_FLOW_LIMITS,
	type FlowDomainOption,
	flowHeadline,
	TOP_LEVEL,
} from "@/lib/citation-flow";
import { OTHERS_COLOR, useChartColors } from "@/lib/company-colors";

export const CITATION_FLOW_ID = "citation-flow";

/** Every page up to this many; past it the tail still folds, so the chart stays a chart. */
const EXPANDED_PAGES = 50;

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
			{flow.engines.map(({ model }) => (
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
						<EngineSwatch color={colors.get(model)} />
						<ModelIcon iconId={getModelMeta(model).iconId} className="size-3.5" />
						<span className="font-medium">{engineLabel(model)}</span>
					</button>
				</li>
			))}
		</ul>
	);
}

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
	const colors = useEngineColors(flow, modelOrder);

	const focusModel = hover?.type === "engine" ? hover.model : pinned;
	const focus: Focus | null = hover ?? (pinned ? { type: "engine", model: pinned } : null);
	const hasFold = flow.nodes.some((node) => node.kind === "more");
	const shownPages = flow.nodes.filter((node) => node.kind === "page").length;
	const canToggleExpanded = (hasFold || expanded) && flow.pageCount > DEFAULT_FLOW_LIMITS.maxPages;

	return (
		<div className="space-y-4">
			<Headline flow={flow} model={focusModel} />
			<EngineLegend
				flow={flow}
				colors={colors}
				pinned={pinned}
				focusModel={focusModel}
				onPin={setPinned}
				onHover={setHover}
			/>
			{width >= MIN_CHART_WIDTH ? (
				<FlowChart flow={flow} width={width} colors={colors} focus={focus} hovered={hover} onHover={setHover} />
			) : (
				<FlowList flow={flow} colors={colors} focusModel={focusModel} onExpand={() => onExpandedChange(true)} />
			)}
			<div className="flex min-h-7 items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground tabular-nums">
				<span>
					{flow.totalCitations.toLocaleString()} citations
					{flow.showSections && ` · ${flow.sectionCount} sections`} ·{" "}
					{canToggleExpanded ? `${shownPages} of ${flow.pageCount}` : flow.pageCount}{" "}
					{flow.pageCount === 1 ? "page" : "pages"}
				</span>
				{canToggleExpanded && (
					<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onExpandedChange(!expanded)}>
						{expanded ? `Show Top ${DEFAULT_FLOW_LIMITS.maxPages}` : `Show All ${flow.pageCount} Pages`}
					</Button>
				)}
			</div>
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
	domains: readonly FlowDomainOption[];
	domain: string | undefined;
	onDomainChange: (domain: string) => void;
	rows: readonly CitationFlowRow[] | undefined;
	isLoading?: boolean;
	modelOrder?: readonly string[];
}) {
	const [expanded, setExpanded] = useState(false);
	const [containerRef, width] = useElementWidth<HTMLDivElement>();

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

	const body = !domain ? (
		<Placeholder>Choose a domain to see how AI engines cite it.</Placeholder>
	) : !flow ? (
		<Skeleton className="h-72 w-full" />
	) : flow.totalCitations === 0 ? (
		<Placeholder>No AI answers cited {domain} under the current filters.</Placeholder>
	) : (
		<FlowView flow={flow} width={width} modelOrder={modelOrder} expanded={expanded} onExpandedChange={setExpanded} />
	);

	return (
		<Card id={CITATION_FLOW_ID} className="scroll-mt-4 gap-4">
			<CardHeader>
				<div className="flex flex-col gap-3 @xl/card-header:flex-row @xl/card-header:items-center @xl/card-header:justify-between">
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
