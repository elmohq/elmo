"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Hash, Users, Search, Target, Inbox } from "lucide-react";
import { IconEditCircle } from "@tabler/icons-react";
import { SiOpenai, SiGoogle, SiAnthropic } from "react-icons/si";
import { usePromptRuns, type LookbackPeriod } from "@/hooks/use-prompt-runs";
import Link from "next/link";
import { PromptChart } from "@/components/prompt-chart";
import { PromptGroupChart } from "@/components/prompt-group-chart";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	reputation: boolean;
	enabled: boolean;
	createdAt: Date;
}

interface PromptsDisplayProps {
	prompts: Prompt[];
	pageTitle: string;
	pageDescription: string;
	editLink: string;
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

type ModelType = "openai" | "anthropic" | "google";

// Mapping of actual model names to our tab categories
const MODEL_MAPPINGS: Record<string, ModelType> = {
	"gpt-4": "openai",
	"claude-3.5-sonnet": "anthropic",
	"gemini-1.5-flash": "google",
};

function getModelIcon(modelType: ModelType) {
	switch (modelType) {
		case "openai":
			return <SiOpenai className="size-3" />;
		case "anthropic":
			return <SiAnthropic className="size-3" />;
		case "google":
			return <SiGoogle className="size-3" />;
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

export function PromptsDisplay({ prompts, pageTitle, pageDescription, editLink }: PromptsDisplayProps) {
	const [selectedModel, setSelectedModel] = useState<ModelType>("openai");
	const [selectedLookback, setSelectedLookback] = useState<LookbackPeriod>("1m");
	const { promptRuns, isLoading: isLoadingRuns, isError: runsError } = usePromptRuns();

	// Group prompts by category + prefix combination
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

	// Filter prompt runs by selected model
	const filteredPromptRuns = promptRuns?.filter(run => {
		const modelType = MODEL_MAPPINGS[run.model];
		return modelType === selectedModel;
	}) || [];

	// Group prompt runs by prompt ID for easier lookup
	const promptRunsByPromptId = filteredPromptRuns.reduce((acc, run) => {
		if (!acc[run.promptId]) {
			acc[run.promptId] = [];
		}
		acc[run.promptId].push(run);
		return acc;
	}, {} as Record<string, typeof filteredPromptRuns>);

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
					defaultValue="openai"
					className="w-full"
					value={selectedModel}
					onValueChange={(value) => setSelectedModel(value as ModelType)}
				>
					<div className="flex justify-between items-center">
					<TabsList>
						<TabsTrigger value="openai" className="cursor-pointer">
							{getModelIcon("openai")} <span>OpenAI</span>
						</TabsTrigger>
						<TabsTrigger value="anthropic" className="cursor-pointer">
							{getModelIcon("anthropic")} <span>Anthropic</span>
						</TabsTrigger>
						<TabsTrigger value="google" className="cursor-pointer">
							{getModelIcon("google")} <span>Google</span>
						</TabsTrigger>
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



					<TabsContent value={selectedModel} className="mt-6">
						<div className="space-y-6">
							{/* Prompt Runs Summary */}
							{!isLoadingRuns && (
								<>
								<PromptChart />
								<PromptGroupChart />
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2">
											{getModelIcon(selectedModel)}
											Recent Runs ({selectedModel})
											<Badge variant="secondary" className="ml-2">
												{filteredPromptRuns.length} runs
											</Badge>
										</CardTitle>
									</CardHeader>
									<CardContent>
										{filteredPromptRuns.length === 0 ? (
											<p className="text-muted-foreground">No runs yet for this model.</p>
										) : (
											<div className="space-y-2">
												{filteredPromptRuns.slice(0, 5).map((run) => {
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
												{filteredPromptRuns.length > 5 && (
													<p className="text-xs text-muted-foreground text-center pt-2">
														And {filteredPromptRuns.length - 5} more runs...
													</p>
												)}
											</div>
										)}
									</CardContent>
								</Card>
								</>
							)}

							{groupEntries.map(([groupKey, groupPrompts]) => {
								// Extract category and prefix from the groupKey and first prompt
								const firstPrompt = groupPrompts[0];
								const groupCategory = firstPrompt?.groupCategory || "Uncategorized";
								const groupPrefix = firstPrompt?.groupPrefix;

								return (
									<Card key={groupKey}>
										<CardHeader>
											<CardTitle className="flex items-center gap-2">
												{getGroupIcon(groupCategory)}
												{groupPrefix && (
													<>
														{groupPrefix}
														<code className="bg-muted px-2 py-1 rounded text-sm font-mono">{groupCategory}</code>
													</>
												)}
												{!groupPrefix && groupCategory}
												<Badge variant="secondary" className="ml-2">
													{groupPrompts.length} {groupPrompts.length === 1 ? "prompt" : "prompts"}
												</Badge>
											</CardTitle>
										</CardHeader>
										<CardContent>
											<div className="grid gap-2">
												{groupPrompts.map((prompt) => {
													const runs = promptRunsByPromptId[prompt.id] || [];
													return (
														<div key={prompt.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
															<div className="flex items-center gap-3">
																<div className="flex-1">
																	<p className="font-medium">{prompt.value}</p>
																	<div className="flex items-center gap-2 mt-1">
																		<Badge variant="outline" className={`text-xs ${getGroupColor(groupCategory)}`}>
																			{groupCategory}
																		</Badge>
																		{prompt.reputation && (
																			<Badge variant="outline" className="text-xs">
																				Reputation
																			</Badge>
																		)}
																		{!prompt.enabled && (
																			<Badge variant="outline" className="text-xs text-muted-foreground">
																				Disabled
																			</Badge>
																		)}
																		{runs.length > 0 && (
																			<Badge variant="outline" className="text-xs bg-green-50 text-green-700">
																				{runs.length} runs
																			</Badge>
																		)}
																	</div>
																</div>
															</div>
															<div className="flex items-center gap-2">
																<Badge variant={prompt.enabled ? "default" : "secondary"}>
																	{prompt.enabled ? "Active" : "Inactive"}
																</Badge>
															</div>
														</div>
													);
												})}
											</div>
										</CardContent>
									</Card>
								);
							})}
						</div>
					</TabsContent>
				</Tabs>
			)}
		</div>
	);
}
