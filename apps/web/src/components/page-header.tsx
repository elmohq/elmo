"use client";

import { ReactNode, useEffect, useRef, useState, useMemo } from "react";
import { useQueryState, parseAsStringLiteral, parseAsArrayOf, parseAsString } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { SiOpenai, SiGoogle, SiAnthropic } from "react-icons/si";
import { MdSelectAll } from "react-icons/md";
import { PromptFilters } from "@/components/prompt-filters";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { VisibilityBar, VisibilityBarSkeleton } from "@/components/visibility-bar";
import { type LookbackPeriod, getDefaultLookbackPeriod } from "@/lib/chart-utils";
import { useBrand } from "@/hooks/use-brands";

export type ModelType = "openai" | "anthropic" | "google" | "all";

const modelParser = parseAsStringLiteral(["openai", "anthropic", "google", "all"] as const);
const lookbackParser = parseAsStringLiteral(["1w", "1m", "3m", "6m", "1y", "all"] as const);
const tagsParser = parseAsArrayOf(parseAsString, ",");
const searchParser = parseAsString;

function getModelIcon(modelType: ModelType) {
	switch (modelType) {
		case "openai":
			return <SiOpenai className="size-3" />;
		case "anthropic":
			return <SiAnthropic className="size-3" />;
		case "google":
			return <SiGoogle className="size-3" />;
		case "all":
			return <MdSelectAll className="size-3" />;
	}
}

function getLookbackLabel(lookback: LookbackPeriod): string {
	switch (lookback) {
		case "1w":
			return "1w";
		case "1m":
			return "1mo";
		case "3m":
			return "3mo";
		case "6m":
			return "6mo";
		case "1y":
			return "1yr";
		case "all":
			return "all";
	}
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
	editTagsLink?: string;
	showSearch?: boolean;
	showModelSelector?: boolean;
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
				<div className="flex justify-between items-center">
					<div className="flex space-x-1 bg-muted rounded-md p-1">
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-8 w-16" />
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-8 w-20" />
						<div className="flex space-x-1 bg-muted rounded-md p-1">
							<Skeleton className="h-8 w-12" />
							<Skeleton className="h-8 w-12" />
							<Skeleton className="h-8 w-12" />
							<Skeleton className="h-8 w-12" />
							<Skeleton className="h-8 w-12" />
							<Skeleton className="h-8 w-12" />
						</div>
					</div>
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
	editTagsLink,
	showSearch = false,
	showModelSelector = false,
	availableModels = ["all", "openai", "anthropic", "google"],
	defaultModel = "all",
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

	const [internalModel, setInternalModel] = useQueryState("model", modelParser.withDefault(defaultModel));
	const [selectedLookback, setSelectedLookback] = useQueryState("lookback", lookbackParser.withDefault(defaultLookback));
	const [selectedTags, setSelectedTags] = useQueryState("tags", tagsParser.withDefault([]));
	const [searchQuery, setSearchQuery] = useQueryState("q", searchParser.withDefault(""));
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

	// Use controlled model if provided, otherwise use internal state
	const selectedModel = controlledModel ?? internalModel;
	const handleModelChange = (model: ModelType) => {
		setInternalModel(model);
		onModelChange?.(model);
	};

	if (isLoading) {
		return <PageHeaderSkeleton />;
	}

	const stuckShadow = "shadow-[0_4px_6px_0px_rgba(255,255,255,1),0_10px_15px_-3px_rgba(255,255,255,1),0_20px_25px_-5px_rgba(255,255,255,0.9)] dark:shadow-[0_4px_6px_0px_rgba(9,9,11,1),0_10px_15px_-3px_rgba(9,9,11,1),0_20px_25px_-5px_rgba(9,9,11,0.9)]";

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
				<div className="flex flex-wrap justify-between items-center gap-2">
					{/* Left side - Model selector or spacer */}
					{showModelSelector ? (
						<Tabs
							value={selectedModel}
							onValueChange={(value) => handleModelChange(value as ModelType)}
							className="w-auto"
						>
							<TabsList>
								{availableModels.includes("all") && (
									<TabsTrigger value="all" className="cursor-pointer">
										{getModelIcon("all")} <span className="sr-only sm:not-sr-only">All</span>
									</TabsTrigger>
								)}
								{availableModels.includes("openai") && (
									<TabsTrigger value="openai" className="cursor-pointer">
										{getModelIcon("openai")} <span className="sr-only sm:not-sr-only">OpenAI</span>
									</TabsTrigger>
								)}
								{availableModels.includes("anthropic") && (
									<TabsTrigger value="anthropic" className="cursor-pointer">
										{getModelIcon("anthropic")} <span className="sr-only sm:not-sr-only">Anthropic</span>
									</TabsTrigger>
								)}
								{availableModels.includes("google") && (
									<TabsTrigger value="google" className="cursor-pointer">
										{getModelIcon("google")} <span className="sr-only sm:not-sr-only">Google</span>
									</TabsTrigger>
								)}
							</TabsList>
						</Tabs>
					) : (
						<div /> // Spacer
					)}

					{/* Right side - Filters and lookback grouped together */}
					<div className="flex items-center gap-1">
						{/* Filters */}
						<PromptFilters
							availableTags={availableTags}
							selectedTags={selectedTags}
							onTagsChange={setSelectedTags}
							searchQuery={showSearch ? searchQuery : undefined}
							onSearchChange={showSearch ? setSearchQuery : undefined}
							editTagsLink={editTagsLink}
							resultCount={resultCount}
						/>

						{/* Time Period Selector */}
						<div className="flex rounded-md bg-muted p-1">
							{(["1w", "1m", "3m", "6m", "1y", "all"] as LookbackPeriod[]).map((period) => (
								<button
									key={period}
									onClick={() => setSelectedLookback(period)}
									className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded cursor-pointer ${
										selectedLookback === period
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
									type="button"
								>
									{getLookbackLabel(period)}
								</button>
							))}
						</div>
					</div>
				</div>

				{/* Visibility summary bar - shows filtered visibility stats */}
				{(isLoadingVisibility || visibilityData) && (
					<div className="mt-3">
						{isLoadingVisibility ? (
							<VisibilityBarSkeleton />
						) : visibilityData ? (
							<VisibilityBar
								currentVisibility={visibilityData.currentVisibility}
								totalRuns={visibilityData.totalRuns}
								totalPrompts={visibilityData.totalPrompts}
								totalCitations={visibilityData.totalCitations}
								visibilityTimeSeries={visibilityData.visibilityTimeSeries}
								lookback={visibilityData.lookback}
							/>
						) : null}
					</div>
				)}
			</div>

			{/* Page content */}
			<div className="space-y-6">
				{children}
			</div>
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
		selectedModel: selectedModel as ModelType,
		selectedLookback: selectedLookback as LookbackPeriod,
		selectedTags,
		searchQuery,
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

