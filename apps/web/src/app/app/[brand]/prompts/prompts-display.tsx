"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Inbox } from "lucide-react";
import { IconEditCircle } from "@tabler/icons-react";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useFilteredVisibility } from "@/hooks/use-filtered-visibility";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";
import { LazyPromptChart } from "@/components/lazy-prompt-chart";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { PageHeader, PageHeaderSkeleton, usePageFilters, usePageFilterSetters, type ModelType } from "@/components/page-header";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

interface PromptsDisplayProps {
	prompts: Prompt[];
	pageTitle: string;
	pageDescription: string;
	pageInfoContent?: React.ReactNode;
	editLink: string;
	excludeModels?: ModelType[];
}

// Loading skeleton for the content area
function ContentLoadingSkeleton() {
	return (
		<div className="space-y-6">
			{[...Array(6)].map((_, i) => (
				<Card key={i} className="py-3 gap-3">
					<CardHeader className="flex justify-between items-center px-3">
						<div className="flex items-center gap-2">
							<Skeleton className="h-4 w-4 rounded" />
							<Skeleton className="h-4 w-48" />
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-6 w-20 rounded-full" />
							<Skeleton className="h-8 w-8 rounded" />
						</div>
					</CardHeader>
					<div className="px-3">
						<Skeleton className="h-px w-full" />
					</div>
					<CardContent className="px-3">
						<Skeleton className="h-[250px] w-full" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

export function PromptsDisplay({
	prompts,
	pageTitle,
	pageDescription,
	pageInfoContent,
	editLink,
	excludeModels = [],
}: PromptsDisplayProps) {
	const { brand } = useBrand();
	const { selectedModel, selectedLookback, selectedTags, searchQuery } = usePageFilters();
	const { clearFilters } = usePageFilterSetters();

	// Filter available models based on excludeModels prop
	const availableIndividualModels: ("openai" | "anthropic" | "google")[] = (
		["openai", "anthropic", "google"] as const
	).filter((model) => !excludeModels.includes(model));

	// Add "all" option if there are multiple models available
	const availableModels: ModelType[] =
		availableIndividualModels.length > 1 ? ["all", ...availableIndividualModels] : availableIndividualModels;

	// Use the new optimized summary hook instead of fetching all prompt runs
	const modelGroupParam = selectedModel === "all" ? undefined : selectedModel;
	const {
		promptsSummary,
		isLoading: isLoadingSummary,
		isError: summaryError,
	} = usePromptsSummary(brand?.id, {
		lookback: selectedLookback,
		modelGroup: modelGroupParam,
		tags: selectedTags.length > 0 ? selectedTags : undefined,
	});

	// Compute filtered prompts (after tag filter from API + local text search)
	const { sortedPrompts, availableTags } = useMemo(() => {
		if (!promptsSummary) {
			return { sortedPrompts: [], availableTags: [] };
		}
		const { prompts: allPrompts, availableTags = [] } = promptsSummary;
		const filtered = searchQuery
			? allPrompts.filter((p) => p.value.toLowerCase().includes(searchQuery.toLowerCase()))
			: allPrompts;
		return { sortedPrompts: filtered, availableTags };
	}, [promptsSummary, searchQuery]);

	// Get prompt IDs for visibility calculation
	const filteredPromptIds = useMemo(() => {
		return sortedPrompts.map(p => p.id);
	}, [sortedPrompts]);

	// Fetch filtered visibility data (for the summary bar) - based on displayed prompts
	const {
		filteredVisibility,
		isLoading: isLoadingVisibility,
	} = useFilteredVisibility(brand?.id, {
		lookback: selectedLookback,
		promptIds: filteredPromptIds.length > 0 ? filteredPromptIds : undefined,
	});

	// Show loading skeleton while summary is loading
	if (isLoadingSummary || !promptsSummary) {
		return (
			<>
				<PageHeaderSkeleton />
				<ContentLoadingSkeleton />
			</>
		);
	}

	// Error state
	if (summaryError) {
		return (
			<PageHeader
				title={pageTitle}
				subtitle={pageDescription}
				infoContent={pageInfoContent}
				availableTags={[]}
				editTagsLink={editLink}
				showSearch
				showModelSelector
				availableModels={availableModels}
			>
				<Card className="p-6">
					<div className="text-center text-muted-foreground">
						<p className="mb-2">Failed to load prompts data</p>
						<p className="text-sm">Try refreshing the page</p>
					</div>
				</Card>
			</PageHeader>
		);
	}

	// Group prompts for display
	const uncategorizedPrompts = sortedPrompts.filter(
		(prompt) => !prompt.groupCategory || prompt.groupCategory === "Uncategorized",
	);

	const groupedPrompts = sortedPrompts
		.filter((prompt) => prompt.groupCategory && prompt.groupCategory !== "Uncategorized")
		.reduce(
			(acc, prompt) => {
				const category = prompt.groupCategory!;
				const prefix = prompt.groupPrefix || "";
				const groupKey = prefix ? `${category}:${prefix}` : category;
				if (!acc[groupKey]) {
					acc[groupKey] = [];
				}
				acc[groupKey].push(prompt);
				return acc;
			},
			{} as Record<string, typeof sortedPrompts>,
		);

	// Create display items - individual prompts and groups
	const individualItems = uncategorizedPrompts.map((prompt) => ({
		type: "individual" as const,
		data: prompt,
	}));

	const groupItems = Object.entries(groupedPrompts).map(([groupKey, groupPrompts]) => ({
		type: "group" as const,
		data: { groupKey, prompts: groupPrompts },
	}));

	const allDisplayItems = [...individualItems, ...groupItems];

	// Check if we have NO prompts at all (not just filtered results)
	const hasNoPromptsAtAll = (promptsSummary?.prompts?.length ?? 0) === 0 && selectedTags.length === 0 && !searchQuery;

	return (
		<PageHeader
			title={pageTitle}
			subtitle={pageDescription}
			infoContent={pageInfoContent}
			availableTags={availableTags}
			editTagsLink={editLink}
			showSearch
			showModelSelector
			availableModels={availableModels}
			resultCount={sortedPrompts.length}
			visibilityData={filteredVisibility}
			isLoadingVisibility={isLoadingVisibility}
		>
			{hasNoPromptsAtAll ? (
				// No prompts at all - show empty state with add button
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p className="mb-4">No prompts yet.</p>
						<Button asChild size="sm" className="h-7 flex cursor-pointer">
							<Link href={editLink}>
								<IconEditCircle />
								<span>Edit</span>
							</Link>
						</Button>
					</div>
				</div>
			) : sortedPrompts.length === 0 ? (
				// Prompts exist but filters returned no results
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p className="mb-2">No prompts match your filters.</p>
						<p className="text-sm mb-4">Try adjusting your search or tag filters.</p>
						<Button
							variant="outline"
							size="sm"
							onClick={clearFilters}
							className="cursor-pointer"
						>
							Clear filters
						</Button>
					</div>
				</div>
			) : (
				<div className="space-y-6">
					{/* Display all items (both individual and group prompts) with lazy loading */}
					{allDisplayItems.map((item, index) => {
						if (item.type === "individual") {
							const prompt = item.data;
							// First 3 charts get high priority for immediate loading
							const priority = index < 3 ? "high" : index < 10 ? "normal" : "low";
							
							return (
								<LazyPromptChart
									key={prompt.id}
									promptName={prompt.value}
									promptId={prompt.id}
									brandId={brand?.id || ""}
									lookback={selectedLookback}
									selectedModel={selectedModel}
									availableModels={availableIndividualModels}
									priority={priority}
									searchHighlight={searchQuery}
								/>
							);
						} else {
							// For groups, we'll render individual charts for each prompt in the group
							const group = item.data as { groupKey: string; prompts: typeof sortedPrompts };
							return (
								<div key={group.groupKey} className="space-y-4">
									{group.prompts.map((prompt, promptIndex) => {
										// Group items get lower priority
										const priority = index < 3 && promptIndex === 0 ? "high" : "low";
										
										return (
											<LazyPromptChart
												key={prompt.id}
												promptName={prompt.value}
												promptId={prompt.id}
												brandId={brand?.id || ""}
												lookback={selectedLookback}
												selectedModel={selectedModel}
												availableModels={availableIndividualModels}
												priority={priority}
												searchHighlight={searchQuery}
											/>
										);
									})}
								</div>
							);
						}
					})}
				</div>
			)}
		</PageHeader>
	);
}
