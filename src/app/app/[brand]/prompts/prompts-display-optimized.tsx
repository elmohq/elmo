"use client";

import { useQueryState, parseAsStringLiteral } from "nuqs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Hash, Users, Search, Target, Inbox } from "lucide-react";
import { IconEditCircle } from "@tabler/icons-react";
import { SiOpenai, SiGoogle, SiAnthropic } from "react-icons/si";
import { MdSelectAll } from "react-icons/md";
import { usePromptsSummary, type LookbackPeriod } from "@/hooks/use-prompts-summary";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";
import { LazyPromptChartFast } from "@/components/lazy-prompt-chart-fast";
import { Skeleton } from "@/components/ui/skeleton";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

interface PromptsDisplayOptimizedProps {
	prompts: Prompt[];
	pageTitle: string;
	pageDescription: string;
	editLink: string;
	webSearchEnabled?: boolean;
	excludeModels?: ModelType[];
}

function getGroupIcon(groupName: string) {
	switch (groupName) {
		case "SEO Keywords":
			return <Search className="h-4 w-4" />;
		case "Competitors":
			return <Target className="h-4 w-4" />;
		case "Custom Prompts":
			return <Plus className="h-4 w-4" />;
		case "Product Categories":
			return <Hash className="h-4 w-4" />;
		default:
			return <Users className="h-4 w-4" />;
	}
}

function getGroupColor(groupName: string) {
	switch (groupName) {
		case "SEO Keywords":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
		case "Competitors":
			return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
		case "Custom Prompts":
			return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
		case "Product Categories":
			return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
		default:
			return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
	}
}

type ModelType = "openai" | "anthropic" | "google" | "all";

const modelParser = parseAsStringLiteral(["openai", "anthropic", "google", "all"] as const);
const lookbackParser = parseAsStringLiteral(["1w", "1m", "3m", "6m", "1y", "all"] as const);

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

// Loading skeleton for the summary
function SummaryLoadingSkeleton() {
	return (
		<div className="space-y-6">
			{/* Header skeleton */}
			<div className="space-y-2">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-96" />
			</div>

			{/* Tabs skeleton */}
			<div className="sticky top-[var(--header-height)] z-10 bg-background pt-6 pb-6 -mx-6 px-6">
				<div className="flex justify-between items-center">
					<div className="flex space-x-1 bg-muted rounded-md p-1">
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-8 w-16" />
					</div>
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

			{/* Chart skeletons */}
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
		</div>
	);
}

export function PromptsDisplayOptimized({
	prompts,
	pageTitle,
	pageDescription,
	editLink,
	webSearchEnabled,
	excludeModels = [],
}: PromptsDisplayOptimizedProps) {
	// Filter available models based on excludeModels prop
	const availableIndividualModels: ("openai" | "anthropic" | "google")[] = (
		["openai", "anthropic", "google"] as const
	).filter((model) => !excludeModels.includes(model));

	// Add "all" option if there are multiple models available
	const availableModels: ModelType[] =
		availableIndividualModels.length > 1 ? ["all", ...availableIndividualModels] : availableIndividualModels;

	// Set default model - prefer "all" if available, otherwise use first available
	const defaultModel = availableModels.includes("all") ? "all" : availableModels[0];
	const [selectedModel, setSelectedModel] = useQueryState("model", modelParser.withDefault(defaultModel));
	const [selectedLookback, setSelectedLookback] = useQueryState("lookback", lookbackParser.withDefault("1w"));

	const { brand } = useBrand();

	// Use the new optimized summary hook instead of fetching all prompt runs
	const modelGroupParam = selectedModel === "all" ? undefined : selectedModel;
	const {
		promptsSummary,
		isLoading: isLoadingSummary,
		isError: summaryError,
	} = usePromptsSummary(brand?.id, {
		lookback: selectedLookback,
		webSearchEnabled,
		modelGroup: modelGroupParam,
	});

	// Show loading skeleton while summary is loading
	if (isLoadingSummary || !promptsSummary) {
		return <SummaryLoadingSkeleton />;
	}

	// Error state
	if (summaryError) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">{pageTitle}</h1>
					<p className="text-muted-foreground">{pageDescription}</p>
				</div>
				<Card className="p-6">
					<div className="text-center text-muted-foreground">
						<p className="mb-2">Failed to load prompts data</p>
						<p className="text-sm">Try refreshing the page</p>
					</div>
				</Card>
			</div>
		);
	}

	const { prompts: sortedPrompts } = promptsSummary;

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

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">{pageTitle}</h1>
				<p className="text-muted-foreground">{pageDescription}</p>
			</div>

			{sortedPrompts.length === 0 ? (
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
			) : (
				/* Model Selection Tabs */
				<Tabs
					defaultValue={defaultModel}
					className="w-full"
					value={selectedModel}
					onValueChange={(value) => setSelectedModel(value as ModelType)}
				>
					<div className="sticky top-[var(--header-height)] z-10 bg-background pt-6 pb-6 -mx-6 px-6 flex justify-between items-center">
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

						<div className="flex items-center gap-2">
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
									>
										{getLookbackLabel(period)}
									</button>
								))}
							</div>
						</div>
					</div>

					<TabsContent value={selectedModel} className="mt-0">
						<div className="space-y-6">
							{/* Display all items (both individual and group prompts) with lazy loading */}
							{allDisplayItems.map((item, index) => {
								if (item.type === "individual") {
									const prompt = item.data;
									// First 3 charts get high priority for immediate loading
									const priority = index < 3 ? "high" : index < 10 ? "normal" : "low";
									
									return (
										<LazyPromptChartFast
											key={prompt.id}
											promptName={prompt.value}
											promptId={prompt.id}
											brandId={brand?.id || ""}
											lookback={selectedLookback}
											webSearchEnabled={webSearchEnabled}
											selectedModel={selectedModel}
											availableModels={availableIndividualModels}
											priority={priority}
										/>
									);
								} else {
									// For groups, we'll render individual charts for each prompt in the group
									// This maintains the same functionality but with lazy loading
									const group = item.data as { groupKey: string; prompts: typeof sortedPrompts };
									return (
										<div key={group.groupKey} className="space-y-4">
											{group.prompts.map((prompt, promptIndex) => {
												// Group items get lower priority
												const priority = index < 3 && promptIndex === 0 ? "high" : "low";
												
												return (
													<LazyPromptChartFast
														key={prompt.id}
														promptName={prompt.value}
														promptId={prompt.id}
														brandId={brand?.id || ""}
														lookback={selectedLookback}
														webSearchEnabled={webSearchEnabled}
														selectedModel={selectedModel}
														availableModels={availableIndividualModels}
														priority={priority}
													/>
												);
											})}
										</div>
									);
								}
							})}
						</div>
					</TabsContent>
				</Tabs>
			)}
		</div>
	);
}
