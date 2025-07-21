"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Hash, Users, Search, Target, Inbox } from "lucide-react";
import { IconEditCircle } from "@tabler/icons-react";
import { SiOpenai, SiGoogle, SiAnthropic } from "react-icons/si";
import { MdSelectAll } from "react-icons/md";
import {
	usePromptRuns,
	usePromptRunsWithWebSearch,
	usePromptRunsWithoutWebSearch,
	type LookbackPeriod,
} from "@/hooks/use-prompt-runs";
import { useBrand } from "@/hooks/use-brands";
import Link from "next/link";
import { PromptChart } from "@/components/prompt-chart";
import { PromptGroupChart } from "@/components/prompt-group-chart";

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

export function PromptsDisplay({
	prompts,
	pageTitle,
	pageDescription,
	editLink,
	webSearchEnabled,
	excludeModels = [],
}: PromptsDisplayProps) {
	// Filter available models based on excludeModels prop
	const availableIndividualModels: ("openai" | "anthropic" | "google")[] = (["openai", "anthropic", "google"] as const).filter(
		(model) => !excludeModels.includes(model),
	);
	
	// Add "all" option if there are multiple models available
	const availableModels: ModelType[] = availableIndividualModels.length > 1 
		? ["all", ...availableIndividualModels]
		: availableIndividualModels;

	// Set default model - prefer "all" if available, otherwise use first available
	const defaultModel = availableModels.includes("all") ? "all" : availableModels[0];
	const [selectedModel, setSelectedModel] = useState<ModelType>(defaultModel);
	const [selectedLookback, setSelectedLookback] = useState<LookbackPeriod>("1w");

	const { brand } = useBrand();

	// Use appropriate hook based on webSearchEnabled prop
	const modelGroupParam = selectedModel === "all" ? undefined : selectedModel;
	const {
		promptRuns,
		isLoading: isLoadingRuns,
		isError: runsError,
	} = webSearchEnabled === true
		? usePromptRunsWithWebSearch(brand?.id, { lookback: selectedLookback, modelGroup: modelGroupParam })
		: webSearchEnabled === false
			? usePromptRunsWithoutWebSearch(brand?.id, { lookback: selectedLookback, modelGroup: modelGroupParam })
			: usePromptRuns(brand?.id, { lookback: selectedLookback, modelGroup: modelGroupParam });

	// Filter to only active prompts
	const activePrompts = prompts.filter((prompt) => prompt.enabled);

	// Group prompt runs by prompt ID for easier lookup
	const promptRunsByPromptId = (promptRuns || []).reduce(
		(acc, run) => {
			if (!acc[run.promptId]) {
				acc[run.promptId] = [];
			}
			acc[run.promptId].push(run);
			return acc;
		},
		{} as Record<string, NonNullable<typeof promptRuns>[number][]>,
	);

	// Calculate brand/competitor mention percentage for a single prompt
	const calculateMentionPercentage = (promptId: string): number => {
		const runs = promptRunsByPromptId[promptId] || [];
		if (runs.length === 0) return 0;
		
		const totalMentions = runs.reduce((total, run) => {
			let mentions = 0;
			// Count brand mention (weighted 2x)
			if (run.brandMentioned) mentions += 2;
			// Count each competitor mention separately (weighted 1x)
			if (run.competitorsMentioned && run.competitorsMentioned.length > 0) {
				mentions += run.competitorsMentioned.length;
			}
			return total + mentions;
		}, 0);
		
		return totalMentions / runs.length; // Average weighted mentions per run
	};

	// Calculate brand/competitor mention percentage for a group of prompts
	const calculateGroupMentionPercentage = (groupPrompts: Prompt[]): number => {
		const allRunsForGroup = groupPrompts.flatMap(prompt => promptRunsByPromptId[prompt.id] || []);
		if (allRunsForGroup.length === 0) return 0;
		
		const totalMentions = allRunsForGroup.reduce((total, run) => {
			let mentions = 0;
			// Count brand mention (weighted 2x)
			if (run.brandMentioned) mentions += 2;
			// Count each competitor mention separately (weighted 1x)
			if (run.competitorsMentioned && run.competitorsMentioned.length > 0) {
				mentions += run.competitorsMentioned.length;
			}
			return total + mentions;
		}, 0);
		
		return totalMentions / allRunsForGroup.length; // Average weighted mentions per run
	};

	// Create unified list of prompts and groups with their mention percentages
	type DisplayItem = {
		type: 'individual' | 'group';
		mentionPercentage: number;
		data: Prompt | { groupKey: string; prompts: Prompt[] };
	};

	const uncategorizedPrompts = activePrompts
		.filter((prompt) => !prompt.groupCategory || prompt.groupCategory === "Uncategorized");

	const groupedPrompts = activePrompts
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
			{} as Record<string, Prompt[]>,
		);

	// Create display items for individual prompts
	const individualItems: DisplayItem[] = uncategorizedPrompts.map(prompt => ({
		type: 'individual' as const,
		mentionPercentage: calculateMentionPercentage(prompt.id),
		data: prompt
	}));

	// Create display items for groups
	const groupItems: DisplayItem[] = Object.entries(groupedPrompts).map(([groupKey, groupPrompts]) => ({
		type: 'group' as const,
		mentionPercentage: calculateGroupMentionPercentage(groupPrompts),
		data: { groupKey, prompts: groupPrompts }
	}));

	// Combine and sort all items by mention percentage, then alphabetically
	const allDisplayItems = [...individualItems, ...groupItems].sort((a, b) => {
		// First sort by mention percentage (descending)
		if (a.mentionPercentage !== b.mentionPercentage) {
			return b.mentionPercentage - a.mentionPercentage;
		}
		
		// Then sort alphabetically
		const nameA = a.type === 'individual' 
			? (a.data as Prompt).value
			: (() => {
				const { groupKey } = a.data as { groupKey: string; prompts: Prompt[] };
				return groupKey.includes(":") ? groupKey.split(":")[1] : groupKey;
			})();
		
		const nameB = b.type === 'individual' 
			? (b.data as Prompt).value
			: (() => {
				const { groupKey } = b.data as { groupKey: string; prompts: Prompt[] };
				return groupKey.includes(":") ? groupKey.split(":")[1] : groupKey;
			})();
		
		return nameA.localeCompare(nameB);
	});

	// Group prompts by category + prefix combination (for display purposes)
	const promptsByGroup = prompts.reduce(
		(acc, prompt) => {
			const category = prompt.groupCategory || "Uncategorized";
			const prefix = prompt.groupPrefix || "";
			// Create a unique key combining category and prefix
			const groupKey = prefix ? `${category}:${prefix}` : category;
			if (!acc[groupKey]) {
				acc[groupKey] = [];
			}
			acc[groupKey].push(prompt);
			return acc;
		},
		{} as Record<string, Prompt[]>,
	);

	const groupEntries = Object.entries(promptsByGroup);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">{pageTitle}</h1>
				<p className="text-muted-foreground">{pageDescription}</p>
			</div>

			{groupEntries.length === 0 ? (
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
									{getModelIcon("all")} <span>All LLMs</span>
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
							{/* Display all items (both individual and group prompts) sorted by mention percentage */}
							{!isLoadingRuns &&
								allDisplayItems.map((item) => {
									if (item.type === 'individual') {
										const prompt = item.data as Prompt;
										return (
											<PromptChart
												key={prompt.id}
												promptName={prompt.value}
												promptId={prompt.id}
												lookback={selectedLookback}
												promptRuns={promptRuns}
												webSearchEnabled={webSearchEnabled}
											/>
										);
									} else {
										const group = item.data as { groupKey: string; prompts: Prompt[] };
										const firstPrompt = group.prompts[0];
										const groupCategory = firstPrompt?.groupCategory || "Uncategorized";
										const groupPrefix = firstPrompt?.groupPrefix;
										const chartName = groupPrefix ? `${groupPrefix} ${groupCategory}` : groupCategory;

										return (
											<PromptGroupChart
												key={group.groupKey}
												groupName={chartName}
												prompts={group.prompts}
												lookback={selectedLookback}
												promptRuns={promptRuns}
												webSearchEnabled={webSearchEnabled}
											/>
										);
									}
								})}

							{/* Prompt Runs Summary */}
							{/* {!isLoadingRuns && (
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											{getModelIcon(selectedModel)}
																				Recent Runs ({selectedModel})
									<Badge variant="secondary" className="ml-2">
										{(promptRuns || []).length} runs
									</Badge>
								</CardTitle>
							</CardHeader>
							<CardContent>
								{(promptRuns || []).length === 0 ? (
									<p className="text-muted-foreground">No runs yet for this model.</p>
								) : (
									<div className="space-y-2">
										{(promptRuns || []).slice(0, 5).map((run) => {
													const prompt = prompts.find(p => p.id === run.promptId);
													return (
														<div key={run.id} className="flex items-center justify-between p-2 rounded border">
															<div>
																<p className="text-sm font-medium">{prompt?.value || 'Unknown prompt'}</p>
																<p className="text-xs text-muted-foreground">
																	{new Date(run.createdAt).toLocaleString()}
																</p>
															</div>
															<Badge variant="outline" className="text-xs">
																{run.model}
															</Badge>
														</div>
													);
												})}
												{(promptRuns || []).length > 5 && (
													<p className="text-xs text-muted-foreground text-center pt-2">
														And {(promptRuns || []).length - 5} more runs...
													</p>
												)}
											</div>
										)}
									</CardContent>
								</Card>
							)} */}
						</div>
					</TabsContent>
				</Tabs>
			)}
		</div>
	);
}
