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
	onExpand?: () => void;
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
				<li className="text-sm text-muted-foreground">
					{onExpand ? (
						<button type="button" onClick={onExpand} className="hover:text-foreground">
							+ {more.name} · {more.value.toLocaleString()} citations
						</button>
					) : (
						`+ ${more.name} · ${more.value.toLocaleString()} citations`
					)}
				</li>
			)}
		</ol>
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
	// Hover and pin refer to this flow's nodes and engines, so a rebuilt flow (expanded, refetched,
	// another domain or filter) starts clean rather than pointing at whatever now sits at that index.
	const [hoverState, setHoverState] = useState<{ flow: CitationFlow; focus: Focus | null }>({ flow, focus: null });
	const hover = hoverState.flow === flow ? hoverState.focus : null;
	const setHover = (focus: Focus | null) => setHoverState({ flow, focus });
	const [pinState, setPinned] = useState<string | null>(null);
	const pinned = flow.engines.some((engine) => engine.model === pinState) ? pinState : null;
	const colors = useEngineColors(flow, modelOrder);

	const focusModel = hover?.type === "engine" ? hover.model : pinned;
	const focus: Focus | null = hover ?? (pinned ? { type: "engine", model: pinned } : null);
	const expand = expanded ? undefined : () => onExpandedChange(true);

	return (
		<div className="space-y-4">
			{width >= MIN_CHART_WIDTH ? (
				<FlowChart
					flow={flow}
					width={width}
					colors={colors}
					focus={focus}
					hovered={hover}
					onHover={setHover}
					pinned={pinned}
					onPin={setPinned}
					onExpand={expand}
				/>
			) : (
				<>
					<EngineLegend
						flow={flow}
						colors={colors}
						pinned={pinned}
						focusModel={focusModel}
						onPin={setPinned}
						onHover={setHover}
					/>
					<FlowList flow={flow} colors={colors} focusModel={focusModel} onExpand={expand} />
				</>
			)}
			{expanded && flow.pageCount > DEFAULT_FLOW_LIMITS.maxPages && (
				<div className="flex justify-end">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs text-muted-foreground"
						onClick={() => onExpandedChange(false)}
					>
						Show Top {DEFAULT_FLOW_LIMITS.maxPages} Pages
					</Button>
				</div>
			)}
		</div>
	);
}

function FlowBody({
	domain,
	flow,
	error,
	isLoadingDomains,
	...view
}: {
	domain: string | undefined;
	flow: CitationFlow | undefined;
	error?: Error | null;
	isLoadingDomains: boolean;
	width: number;
	modelOrder: readonly string[];
	expanded: boolean;
	onExpandedChange: (expanded: boolean) => void;
}) {
	if (error && !flow) return <Placeholder>The Citation Flow couldn't load. Try again in a moment.</Placeholder>;
	if (!domain && isLoadingDomains) return <Skeleton className="h-72 w-full" />;
	if (!domain) return <Placeholder>No domains were cited under the current filters.</Placeholder>;
	if (!flow) return <Skeleton className="h-72 w-full" />;
	if (flow.totalCitations === 0) {
		return <Placeholder>No AI answers cited {domain} under the current filters.</Placeholder>;
	}
	return <FlowView flow={flow} {...view} />;
}

export function CitationFlowCard({
	domains,
	domain,
	onDomainChange,
	search,
	onSearchChange,
	isLoadingDomains = false,
	rows,
	isLoading = false,
	error,
	modelOrder = [],
}: {
	domains: readonly FlowDomainOption[];
	isLoadingDomains?: boolean;
	domain: string | undefined;
	onDomainChange: (domain: string) => void;
	search: string;
	onSearchChange: (search: string) => void;
	rows: readonly CitationFlowRow[] | undefined;
	isLoading?: boolean;
	error?: Error | null;
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
					<DomainPicker
						domains={domains}
						value={domain}
						onChange={onDomainChange}
						search={search}
						onSearchChange={onSearchChange}
					/>
				</div>
			</CardHeader>
			<Separator />
			<CardContent>
				<div ref={containerRef} className={cn("@container/flow transition-opacity", isLoading && flow && "opacity-60")}>
					<FlowBody
						domain={domain}
						flow={flow}
						error={error}
						isLoadingDomains={isLoadingDomains}
						width={width}
						modelOrder={modelOrder}
						expanded={expanded}
						onExpandedChange={setExpanded}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
