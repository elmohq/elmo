"use client";

import { ReactNode } from "react";
import { useQueryState, parseAsStringLiteral, parseAsArrayOf, parseAsString } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { SiOpenai, SiGoogle, SiAnthropic } from "react-icons/si";
import { MdSelectAll } from "react-icons/md";
import { PromptFilters } from "@/components/prompt-filters";
import { Skeleton } from "@/components/ui/skeleton";
import type { LookbackPeriod } from "@/lib/chart-utils";

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
			<div className="sticky top-[var(--header-height)] z-10 bg-background pt-2 pb-4">
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
	children,
}: PageHeaderProps) {
	const [internalModel, setInternalModel] = useQueryState("model", modelParser.withDefault(defaultModel));
	const [selectedLookback, setSelectedLookback] = useQueryState("lookback", lookbackParser.withDefault("1w"));
	const [selectedTags, setSelectedTags] = useQueryState("tags", tagsParser.withDefault([]));
	const [searchQuery, setSearchQuery] = useQueryState("q", searchParser.withDefault(""));

	// Use controlled model if provided, otherwise use internal state
	const selectedModel = controlledModel ?? internalModel;
	const handleModelChange = (model: ModelType) => {
		setInternalModel(model);
		onModelChange?.(model);
	};

	if (isLoading) {
		return <PageHeaderSkeleton />;
	}

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

			{/* Sticky controls bar */}
			<div className="sticky top-[var(--header-height)] z-10 bg-background pt-2 pb-4">
				<div className="flex justify-between items-center">
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
										{getModelIcon("all")} <span>All</span>
									</TabsTrigger>
								)}
								{availableModels.includes("openai") && (
									<TabsTrigger value="openai" className="cursor-pointer">
										{getModelIcon("openai")} <span>OpenAI</span>
									</TabsTrigger>
								)}
								{availableModels.includes("anthropic") && (
									<TabsTrigger value="anthropic" className="cursor-pointer">
										{getModelIcon("anthropic")} <span>Anthropic</span>
									</TabsTrigger>
								)}
								{availableModels.includes("google") && (
									<TabsTrigger value="google" className="cursor-pointer">
										{getModelIcon("google")} <span>Google</span>
									</TabsTrigger>
								)}
							</TabsList>
						</Tabs>
					) : (
						<div /> // Spacer
					)}

					{/* Right side - Filters and lookback */}
					<div className="flex items-center gap-2">
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
									className={`px-3 py-1 text-sm rounded cursor-pointer ${
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
			</div>

			{/* Page content */}
			<div className="space-y-6">
				{children}
			</div>
		</div>
	);
}

// Hook to get current filter state
export function usePageFilters() {
	const [selectedModel] = useQueryState("model", modelParser.withDefault("all"));
	const [selectedLookback] = useQueryState("lookback", lookbackParser.withDefault("1w"));
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

