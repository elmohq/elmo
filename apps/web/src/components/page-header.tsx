import { ReactNode, useEffect, useRef, useState, useMemo, startTransition } from "react";
import { useQueryState, parseAsStringLiteral, parseAsArrayOf, parseAsString } from "nuqs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { SiOpenai, SiGoogle, SiAnthropic } from "react-icons/si";
import { MdSelectAll } from "react-icons/md";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover";
import { ChevronDown, Search, Tag as TagIcon, Clock, X } from "lucide-react";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { VisibilityBar, VisibilityBarSkeleton, VisibilityBarEmpty } from "@/components/visibility-bar";
import { type LookbackPeriod, getDefaultLookbackPeriod } from "@/lib/chart-utils";
import { useBrand } from "@/hooks/use-brands";

export type ModelType = "chatgpt" | "claude" | "google-ai-mode" | "all";

/** All individual models Elmo tracks. Used as the fallback when a brand has
 *  no per-brand model config. Keep in sync with the visibility/citations
 *  backend so the filter stays a pure display concern. */
const ALL_MODEL_IDS = ["chatgpt", "claude", "google-ai-mode"] as const satisfies readonly Exclude<ModelType, "all">[];

/** Compute the filter options to show for a brand.
 *  - Unconfigured (`null`/empty): every known model + "All" (matches pre-config behavior).
 *  - 2+ configured: those specific models + "All".
 *  - 1 configured: just that model — hides the "All" toggle since it's redundant.
 *  Callers decide whether to render a selector when only one model is returned. */
export function getAvailableModelsForBrand(
	enabledModels: readonly string[] | null | undefined,
): ModelType[] {
	const configured = enabledModels?.length
		? ALL_MODEL_IDS.filter((m) => enabledModels.includes(m))
		: [...ALL_MODEL_IDS];
	return configured.length > 1 ? ["all", ...configured] : configured;
}

// Every URL setter runs its React state update through React.startTransition,
// which makes the resulting re-render (PageHeader + prompts-display + 30
// chart cards + SWR refetches) interruptible. Urgent work — dropdown close
// animation, the next click, typing — cuts in front and the filter
// interaction feels instant. nuqs documents this option explicitly at
// https://nuqs.47ng.com/docs/options.
const modelParser = parseAsStringLiteral(["chatgpt", "claude", "google-ai-mode", "all"] as const).withOptions({ startTransition });
const lookbackParser = parseAsStringLiteral(["1w", "1m", "3m", "6m", "1y", "all"] as const).withOptions({ startTransition });
const tagsParser = parseAsArrayOf(parseAsString, ",").withOptions({ startTransition });
const searchParser = parseAsString.withOptions({ startTransition });

function getModelIcon(modelType: ModelType, className = "size-3.5") {
	switch (modelType) {
		case "chatgpt":
			return <SiOpenai className={className} />;
		case "claude":
			return <SiAnthropic className={className} />;
		case "google-ai-mode":
			return <SiGoogle className={className} />;
		case "all":
			return <MdSelectAll className={className} />;
	}
}

function getModelLabel(modelType: ModelType): string {
	switch (modelType) {
		case "chatgpt":
			return "ChatGPT";
		case "claude":
			return "Claude";
		case "google-ai-mode":
			return "Google";
		case "all":
			return "All models";
	}
}

const LOOKBACK_OPTIONS: { value: LookbackPeriod; label: string }[] = [
	{ value: "1w", label: "Last 7 days" },
	{ value: "1m", label: "Last 30 days" },
	{ value: "3m", label: "Last 3 months" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "1y", label: "Last 12 months" },
	{ value: "all", label: "All time" },
];

function getLookbackLabel(lookback: LookbackPeriod): string {
	return LOOKBACK_OPTIONS.find((o) => o.value === lookback)?.label ?? lookback;
}

interface VisibilityTimeSeriesPoint {
	date: string;
	visibility: number | null;
}

interface VisibilityData {
	currentVisibility: number;
	totalRuns: number;
	totalPrompts: number;
	totalCitations: number;
	visibilityTimeSeries: VisibilityTimeSeriesPoint[];
	lookback: string;
}

interface PageHeaderProps {
	title: string;
	subtitle: string;
	infoContent?: ReactNode;
	availableTags?: string[];
	showSearch?: boolean;
	showModelSelector?: boolean;
	showVisibilityBar?: boolean;
	availableModels?: ModelType[];
	defaultModel?: ModelType;
	onModelChange?: (model: ModelType) => void;
	selectedModel?: ModelType;
	isLoading?: boolean;
	resultCount?: number;
	visibilityData?: VisibilityData;
	isLoadingVisibility?: boolean;
	children?: ReactNode;
}

// Loading skeleton for the header
export function PageHeaderSkeleton() {
	return (
		<div className="space-y-4">
			{/* Header skeleton */}
			<div className="space-y-2">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-5 w-80" />
			</div>

			{/* Controls skeleton */}
			<div className="sticky top-[var(--header-height)] z-10 pt-2 pb-4 bg-white dark:bg-zinc-950 shadow-[0_4px_6px_0px_rgba(255,255,255,1),0_10px_15px_-3px_rgba(255,255,255,1),0_20px_25px_-5px_rgba(255,255,255,0.9)] dark:shadow-[0_4px_6px_0px_rgba(9,9,11,1),0_10px_15px_-3px_rgba(9,9,11,1),0_20px_25px_-5px_rgba(9,9,11,0.9)]">
				<div className="flex justify-between items-center gap-2">
					<div className="flex gap-1.5">
						<Skeleton className="h-8 w-28" />
						<Skeleton className="h-8 w-24" />
						<Skeleton className="h-8 w-32" />
					</div>
					<Skeleton className="h-8 w-56" />
				</div>

				{/* Visibility bar skeleton — reserves space so charts don't jump when real bar appears */}
				<div className="mt-3">
					<VisibilityBarSkeleton />
				</div>
			</div>
		</div>
	);
}

export function PageHeader({
	title,
	subtitle,
	infoContent,
	availableTags = [],
	showSearch = false,
	showModelSelector = false,
	showVisibilityBar = false,
	availableModels: availableModelsProp,
	defaultModel,
	onModelChange,
	selectedModel: controlledModel,
	isLoading = false,
	resultCount,
	visibilityData,
	isLoadingVisibility = false,
	children,
}: PageHeaderProps) {
	const { brand } = useBrand();
	const defaultLookback = useMemo(
		() => getDefaultLookbackPeriod(brand?.earliestDataDate),
		[brand?.earliestDataDate]
	);

	// Default the filter options to what this brand actually runs; callers can
	// still pass `availableModels` explicitly to override (e.g. prompt-details).
	const brandModels = useMemo(
		() => getAvailableModelsForBrand(brand?.enabledModels),
		[brand?.enabledModels],
	);
	const availableModels = availableModelsProp ?? brandModels;
	// Fall back to the first available option when "all" has been hidden
	// because the brand only tracks a single model.
	const effectiveDefaultModel: ModelType =
		defaultModel ?? (availableModels.includes("all") ? "all" : (availableModels[0] ?? "all"));
	// A filter with one option is just noise — hide the selector in that case.
	const shouldShowModelSelector = showModelSelector && availableModels.length > 1;

	const [internalModelRaw, setInternalModel] = useQueryState("model", modelParser.withDefault(effectiveDefaultModel));
	const internalModel = internalModelRaw ?? effectiveDefaultModel;
	const [selectedLookbackRaw, setSelectedLookback] = useQueryState("lookback", lookbackParser.withDefault(defaultLookback));
	const selectedLookback = selectedLookbackRaw ?? defaultLookback;
	const [selectedTagsRaw, setSelectedTags] = useQueryState("tags", tagsParser.withDefault([]));
	const selectedTags = selectedTagsRaw ?? [];
	const [searchQueryRaw, setSearchQuery] = useQueryState("q", searchParser.withDefault(""));
	const searchQuery = searchQueryRaw ?? "";
	const [isStuck, setIsStuck] = useState(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	// Detect when sticky header becomes stuck using IntersectionObserver
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				// When sentinel is not visible (scrolled past), header is stuck
				setIsStuck(!entry.isIntersecting);
			},
			{ threshold: 0 }
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	const selectedModel = controlledModel ?? internalModel ?? effectiveDefaultModel;
	const handleModelChange = (model: ModelType) => {
		setInternalModel(model);
		onModelChange?.(model);
	};

	if (isLoading) {
		return <PageHeaderSkeleton />;
	}

	const stuckShadow = "shadow-[0_4px_6px_0px_rgba(255,255,255,1),0_10px_15px_-3px_rgba(255,255,255,1),0_20px_25px_-5px_rgba(255,255,255,0.9)] dark:shadow-[0_4px_6px_0px_rgba(9,9,11,1),0_10px_15px_-3px_rgba(9,9,11,1),0_20px_25px_-5px_rgba(9,9,11,0.9)]";
	const hasTagsFilter = selectedTags.length > 0;

	return (
		<div className="space-y-0">
			{/* Title section */}
			<div className="mb-4">
				<h1 className="text-3xl font-bold flex items-center gap-2">
					{title}
					{infoContent && (
						<Tooltip>
							<TooltipTrigger asChild>
								<IconInfoCircle className="h-5 w-5 text-muted-foreground cursor-help" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs text-sm font-normal">
								{infoContent}
							</TooltipContent>
						</Tooltip>
					)}
				</h1>
				<p className="text-muted-foreground mt-1">{subtitle}</p>
			</div>

			{/* Sentinel element to detect when sticky header becomes stuck */}
			<div ref={sentinelRef} className="h-0" />

			{/* Sticky controls bar - shadow only appears when stuck */}
			<div className={`sticky top-[var(--header-height)] z-10 pt-2 pb-4 bg-white dark:bg-zinc-950 ${isStuck ? stuckShadow : ''}`}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					{/* Left side — filter dropdowns */}
					<div className="flex flex-wrap items-center gap-1.5">
						{shouldShowModelSelector && (
							<ModelDropdown
								availableModels={availableModels}
								selectedModel={selectedModel}
								onChange={handleModelChange}
							/>
						)}
						<TagsDropdown
							availableTags={availableTags}
							selectedTags={selectedTags}
							onChange={setSelectedTags}
						/>
						<LookbackDropdown
							selected={selectedLookback}
							onChange={(lb) => setSelectedLookback(lb)}
						/>
						{(hasTagsFilter || searchQuery) && resultCount !== undefined && (
							<span className="text-xs text-muted-foreground tabular-nums ml-1">
								{resultCount.toLocaleString()} {resultCount === 1 ? "result" : "results"}
							</span>
						)}
					</div>

					{/* Right side — search */}
					{showSearch && (
						<SearchInput value={searchQuery} onChange={setSearchQuery} />
					)}
				</div>

				{/* Visibility summary bar - skeleton stays in DOM (grid overlay) for stable height; opacity-0 hides it once real bar loads */}
				{showVisibilityBar && (() => {
					const hasLoaded = visibilityData && !isLoadingVisibility;
					const hasData = hasLoaded && visibilityData.totalRuns > 0;
					const isEmpty = hasLoaded && visibilityData.totalRuns === 0;
					return (
						<div className="mt-3 grid [&>*]:col-start-1 [&>*]:row-start-1">
							<div className={(hasData || isEmpty) ? "opacity-0 pointer-events-none" : undefined}>
								<VisibilityBarSkeleton />
							</div>
							{hasData && (
								<VisibilityBar
									currentVisibility={visibilityData.currentVisibility}
									totalRuns={visibilityData.totalRuns}
									totalPrompts={visibilityData.totalPrompts}
									totalCitations={visibilityData.totalCitations}
									visibilityTimeSeries={visibilityData.visibilityTimeSeries}
									lookback={visibilityData.lookback}
								/>
							)}
							{isEmpty && <VisibilityBarEmpty />}
						</div>
					);
				})()}
			</div>

			{/* Page content */}
			<div className="space-y-6">
				{children}
			</div>
		</div>
	);
}

// ------------------------------------------------------------------
// Filter-bar subcomponents
// ------------------------------------------------------------------

// Props forward to the underlying Button so `<DropdownMenuTrigger asChild>` /
// `<PopoverTrigger asChild>` can hand their ref + data-state directly to the
// button element (wrapping in a div would make Slot target the div instead
// and introduce a stale focus target).
type FilterTriggerButtonProps = {
	icon: ReactNode;
	label: string;
	active?: boolean;
	badgeCount?: number;
} & React.ComponentProps<"button">;

function FilterTriggerButton({
	icon,
	label,
	active,
	badgeCount,
	className,
	...props
}: FilterTriggerButtonProps) {
	return (
		<Button
			variant="outline"
			size="sm"
			{...props}
			className={`h-8 gap-1.5 cursor-pointer font-normal ${
				active ? "border-foreground/30 bg-accent/50" : ""
			} ${className ?? ""}`}
		>
			<span className="text-muted-foreground flex items-center">{icon}</span>
			<span className="text-foreground">{label}</span>
			{badgeCount !== undefined && badgeCount > 0 && (
				<span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
					{badgeCount}
				</span>
			)}
			<ChevronDown className="size-3.5 text-muted-foreground" />
		</Button>
	);
}

// Shallow equality for string[] — tag lists are short so the O(n) scan is fine.
function arraysEqual(a: readonly string[], b: readonly string[]) {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

function ModelDropdown({
	availableModels,
	selectedModel,
	onChange,
}: {
	availableModels: ModelType[];
	selectedModel: ModelType;
	onChange: (model: ModelType) => void;
}) {
	// Optimistic local copy so the trigger label flips the instant the user
	// clicks, even while the URL round-trip and downstream re-renders are
	// still in flight. `pushedRef` distinguishes our own commits (echo — skip)
	// from external resets (e.g. clearFilters — adopt).
	const [optimistic, setOptimistic] = useState(selectedModel);
	const pushedRef = useRef(selectedModel);

	useEffect(() => {
		if (selectedModel === pushedRef.current) return;
		pushedRef.current = selectedModel;
		setOptimistic(selectedModel);
	}, [selectedModel]);

	const handleChange = (next: ModelType) => {
		setOptimistic(next);
		pushedRef.current = next;
		onChange(next);
	};

	const isFiltered = optimistic !== "all";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FilterTriggerButton
					icon={getModelIcon(optimistic, "size-3.5")}
					label={getModelLabel(optimistic)}
					active={isFiltered}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuRadioGroup
					value={optimistic}
					onValueChange={(v) => handleChange(v as ModelType)}
				>
					{availableModels.map((model) => (
						<DropdownMenuRadioItem key={model} value={model} className="cursor-pointer gap-2">
							{getModelIcon(model, "size-3.5")}
							{getModelLabel(model)}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function LookbackDropdown({
	selected,
	onChange,
}: {
	selected: LookbackPeriod;
	onChange: (lookback: LookbackPeriod) => void;
}) {
	const [optimistic, setOptimistic] = useState(selected);
	const pushedRef = useRef(selected);

	useEffect(() => {
		if (selected === pushedRef.current) return;
		pushedRef.current = selected;
		setOptimistic(selected);
	}, [selected]);

	const handleChange = (next: LookbackPeriod) => {
		setOptimistic(next);
		pushedRef.current = next;
		onChange(next);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<FilterTriggerButton
					icon={<Clock className="size-3.5" />}
					label={getLookbackLabel(optimistic)}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuRadioGroup
					value={optimistic}
					onValueChange={(v) => handleChange(v as LookbackPeriod)}
				>
					{LOOKBACK_OPTIONS.map((opt) => (
						<DropdownMenuRadioItem key={opt.value} value={opt.value} className="cursor-pointer">
							{opt.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function TagsDropdown({
	availableTags,
	selectedTags,
	onChange,
}: {
	availableTags: string[];
	selectedTags: string[];
	onChange: (tags: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const [optimistic, setOptimistic] = useState<string[]>(selectedTags);
	const pushedRef = useRef(selectedTags);

	useEffect(() => {
		if (arraysEqual(selectedTags, pushedRef.current)) return;
		pushedRef.current = selectedTags;
		setOptimistic(selectedTags);
	}, [selectedTags]);

	const commit = (next: string[]) => {
		setOptimistic(next);
		pushedRef.current = next;
		onChange(next);
	};

	const toggle = (tag: string) => {
		commit(
			optimistic.includes(tag)
				? optimistic.filter((t) => t !== tag)
				: [...optimistic, tag],
		);
	};

	return (
		<Popover open={open} onOpenChange={setOpen} modal={false}>
			<PopoverTrigger asChild>
				<FilterTriggerButton
					icon={<TagIcon className="size-3.5" />}
					label="Tags"
					active={optimistic.length > 0}
					badgeCount={optimistic.length > 0 ? optimistic.length : undefined}
				/>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
				<div className="flex items-center justify-between px-3 h-10 border-b">
					<span className="font-medium text-sm">Tags</span>
					{optimistic.length > 0 && (
						<button
							type="button"
							onClick={() => commit([])}
							className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
						>
							Clear
						</button>
					)}
				</div>
				{availableTags.length === 0 ? (
					<p className="text-sm text-muted-foreground py-6 text-center">No tags available</p>
				) : (
					<div className="py-1 max-h-64 overflow-y-auto">
						{availableTags.map((tag) => {
							const checked = optimistic.includes(tag);
							return (
								<div
									key={tag}
									role="button"
									tabIndex={0}
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										toggle(tag);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											toggle(tag);
										}
									}}
									className={`flex items-center gap-2.5 py-1.5 px-3 cursor-pointer text-left text-sm ${
										checked ? "bg-accent" : "hover:bg-muted"
									}`}
								>
									<Checkbox checked={checked} className="pointer-events-none" />
									<span className="capitalize flex-1">{tag}</span>
								</div>
							);
						})}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

function SearchInput({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const [local, setLocal] = useState(value);
	const pushedRef = useRef(value);

	// Sync external resets (e.g. clearFilters()) into the input. The
	// `pushedRef` guard skips the echo from our own debounced commit, which
	// otherwise races with in-flight keystrokes and flashes the input empty.
	useEffect(() => {
		if (value === pushedRef.current) return;
		pushedRef.current = value;
		setLocal(value);
	}, [value]);

	// Debounced commit. No transition wrapper: nuqs's URL update already runs
	// synchronously, and letting it commit at default priority keeps
	// downstream reads (useBatchChartData's queryKey) in sync with the URL.
	useEffect(() => {
		if (local === pushedRef.current) return;
		const timer = setTimeout(() => {
			pushedRef.current = local;
			onChange(local);
		}, 250);
		return () => clearTimeout(timer);
	}, [local, onChange]);

	const clear = () => {
		setLocal("");
		pushedRef.current = "";
		onChange("");
	};

	return (
		<div className="relative w-full sm:w-64">
			<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
			<Input
				value={local}
				onChange={(e) => setLocal(e.target.value)}
				placeholder="Search prompts..."
				className="h-8 pl-8 pr-8 text-sm"
			/>
			{local && (
				<button
					type="button"
					onClick={clear}
					className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
					aria-label="Clear search"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
}

// Hook to get current filter state
// Uses brand's earliest data date to determine default lookback (1m if > 1 week of data, else 1w)
export function usePageFilters() {
	const { brand } = useBrand();
	const defaultLookback = useMemo(
		() => getDefaultLookbackPeriod(brand?.earliestDataDate),
		[brand?.earliestDataDate]
	);

	const [selectedModel] = useQueryState("model", modelParser.withDefault("all"));
	const [selectedLookback] = useQueryState("lookback", lookbackParser.withDefault(defaultLookback));
	const [selectedTags] = useQueryState("tags", tagsParser.withDefault([]));
	const [searchQuery] = useQueryState("q", searchParser.withDefault(""));

	return {
		selectedModel: (selectedModel ?? "all") as ModelType,
		selectedLookback: (selectedLookback ?? defaultLookback) as LookbackPeriod,
		selectedTags: selectedTags ?? [],
		searchQuery: searchQuery ?? "",
	};
}

// Hook to get setter functions for filters
export function usePageFilterSetters() {
	const [, setSelectedModel] = useQueryState("model", modelParser);
	const [, setSelectedLookback] = useQueryState("lookback", lookbackParser);
	const [, setSelectedTags] = useQueryState("tags", tagsParser);
	const [, setSearchQuery] = useQueryState("q", searchParser);

	return {
		setSelectedModel: (model: ModelType) => setSelectedModel(model),
		setSelectedLookback: (lookback: LookbackPeriod) => setSelectedLookback(lookback),
		setSelectedTags,
		setSearchQuery,
		clearFilters: () => {
			setSelectedTags([]);
			setSearchQuery("");
		},
	};
}
