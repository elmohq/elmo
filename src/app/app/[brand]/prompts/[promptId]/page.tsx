"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getModelDisplayName } from "@/lib/utils";

// Custom tick component for better text rendering with brand bolding
const CustomTick = (props: any) => {
	const { x, y, payload } = props;
	return (
		<g transform={`translate(${x},${y})`}>
			<text 
				x={0} 
				y={0} 
				dy={4} 
				textAnchor="end" 
				fill="#666" 
				fontSize="12"
				style={{ maxWidth: '220px' }}
			>
				{payload.value}
			</text>
		</g>
	);
};

// Custom brand tick component that bolds the current brand
const BrandTick = (props: any, currentBrandName?: string) => {
	const { x, y, payload } = props;
	const isBrand = payload.value === currentBrandName;
	
	return (
		<g transform={`translate(${x},${y})`}>
			<text 
				x={-5} 
				y={0} 
				dy={4} 
				textAnchor="end" 
				fill={isBrand ? "#1f2937" : "#666"} 
				fontSize="12"
				fontWeight={isBrand ? "bold" : "normal"}
				style={{ maxWidth: '220px' }}
			>
				{payload.value}
			</text>
		</g>
	);
};

// Reusable Horizontal Bar Chart Component
interface HorizontalBarChartProps {
	data: { name: string; count: number }[];
	color: string;
	tooltipLabel: string;
	highlightValue?: string;
	tickComponent?: React.ComponentType<any>;
	maxValue?: number;
}

const HorizontalBarChart = ({ 
	data, 
	color, 
	tooltipLabel, 
	highlightValue, 
	tickComponent: TickComponent = CustomTick,
	maxValue 
}: HorizontalBarChartProps) => {
	// Helper function to get max count safely
	const getMaxCount = (chartData: { count: number }[]) => {
		if (!chartData || chartData.length === 0) return 1;
		const validCounts = chartData.map(d => d.count).filter(count => typeof count === 'number' && !isNaN(count) && count >= 0);
		if (validCounts.length === 0) return 1;
		const max = Math.max(...validCounts);
		return isNaN(max) ? 1 : Math.max(max, 1);
	};

	// Helper function to validate chart data
	const isValidChartData = (chartData: { name: string; count: number }[]) => {
		if (!chartData || !Array.isArray(chartData) || chartData.length === 0) return false;
		return chartData.every(item => 
			item && 
			typeof item.name === 'string' && 
			typeof item.count === 'number' && 
			!isNaN(item.count) && 
			item.count >= 0
		);
	};

	// Calculate dynamic heights based on number of categories (40px per bar + padding)
	const calculateChartHeight = (itemCount: number, minHeight = 200, maxHeight = 800) => {
		const calculatedHeight = Math.max(minHeight, Math.min(maxHeight, itemCount * 40 + 80));
		return calculatedHeight;
	};

	if (!isValidChartData(data)) {
		return (
			<div className="text-muted-foreground text-center py-8">
				No data available
			</div>
		);
	}

	return (
		<div style={{ height: calculateChartHeight(data.length) }}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart
					data={data}
					layout="vertical"
					margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
				>
					<CartesianGrid strokeDasharray="3 3" />
					<XAxis 
						type="number" 
						domain={[0, maxValue || getMaxCount(data)]}
						tickCount={Math.min(10, (maxValue || getMaxCount(data)) + 1)}
						allowDecimals={false}
					/>
					<YAxis dataKey="name" type="category" width={240} tick={<TickComponent />} interval={0} />
					<Tooltip formatter={(value) => [value, tooltipLabel]} />
					<Bar dataKey="count" fill={color} barSize={8} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
};

import { useBrand, useCompetitors } from "@/hooks/use-brands";
import { Separator } from "@/components/ui/separator";

type PromptRun = {
	id: string;
	promptId: string;
	modelGroup: string;
	model: string;
	webSearchEnabled: boolean;
	rawOutput: any;
	webQueries: string[];
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: string;
};

type PromptRunsResponse = {
	prompt: {
		id: string;
		brandId: string;
		value: string;
	};
	runs: PromptRun[];
};

export default function PromptHistoryPage() {
	const params = useParams();
	const brandId = params.brand as string;
	const promptId = params.promptId as string;

	const [promptRuns, setPromptRuns] = useState<PromptRunsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Get brand and competitor data
	const { brand } = useBrand(brandId);
	const { competitors } = useCompetitors(brandId);

	// Create custom tick component with brand name
	const BrandYAxisTick = (props: any) => {
		return BrandTick(props, brand?.name);
	};

	// Fetch prompt runs when component mounts
	useEffect(() => {
		const fetchPromptRuns = async () => {
			if (!promptId) return;

			setLoading(true);
			setError(null);

			try {
				const response = await fetch(`/api/prompts/${promptId}/runs`);
				if (!response.ok) {
					throw new Error("Failed to fetch prompt runs");
				}
				const data = await response.json();
				setPromptRuns(data);
			} catch (err) {
				console.error("Error fetching prompt runs:", err);
				setError("Failed to load prompt runs");
			} finally {
				setLoading(false);
			}
		};

		fetchPromptRuns();
	}, [promptId]);

	const formatRawOutput = (rawOutput: any) => {
		if (typeof rawOutput === "string") {
			return rawOutput;
		}
		return JSON.stringify(rawOutput, null, 2);
	};

	const extractTextContent = (rawOutput: any, modelGroup: string): string => {
		try {
			switch (modelGroup) {
				case "openai":
					// OpenAI uses result.text from generateText
					if (rawOutput && typeof rawOutput.text === "string") {
						return rawOutput.text;
					}
					break;

				case "anthropic":
					// Anthropic uses response.content with text blocks
					if (rawOutput && Array.isArray(rawOutput.content)) {
						const textBlocks = rawOutput.content.filter((block: any) => block.type === "text");
						return textBlocks.map((block: any) => block.text).join("\n");
					}
					break;

				case "google":
					// DataForSEO uses AI overview markdown
					if (rawOutput && rawOutput.tasks && rawOutput.tasks.length > 0) {
						const task = rawOutput.tasks[0];
						if (task.result && task.result.length > 0) {
							const result = task.result[0];
							const items = result.items || [];
							const aiOverviewItems = items.filter((item: any) => item.type === "ai_overview");

							if (aiOverviewItems.length > 0 && aiOverviewItems[0].markdown) {
								return aiOverviewItems[0].markdown;
							}
						}
					}
					return "No AI overview content found.";

				default:
					return "Unknown model group - cannot extract text content.";
			}
		} catch (error) {
			console.error("Error extracting text content:", error);
			return "Error extracting text content.";
		}

		return "No text content found.";
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleString();
	};

	// Calculate mention statistics by brand/competitor name
	const calculateMentionStats = () => {
		if (!promptRuns?.runs || !brand) return [];

		const mentionCounts: Record<string, number> = {};

		// Initialize counts
		if (brand.name) {
			mentionCounts[brand.name] = 0;
		}
		competitors?.forEach((competitor) => {
			if (competitor.name) {
				mentionCounts[competitor.name] = 0;
			}
		});
		mentionCounts["(no brand mentions)"] = 0;

		// Count mentions in each run
		promptRuns.runs.forEach((run) => {
			let foundMention = false;

			// Count brand mentions
			if (run.brandMentioned && brand.name) {
				mentionCounts[brand.name]++;
				foundMention = true;
			}

			// Count competitor mentions
			if (run.competitorsMentioned && run.competitorsMentioned.length > 0) {
				run.competitorsMentioned.forEach((competitorName) => {
					if (mentionCounts.hasOwnProperty(competitorName)) {
						mentionCounts[competitorName]++;
						foundMention = true;
					}
				});
			}

			// Count no mentions
			if (!foundMention) {
				mentionCounts["(no brand mentions)"]++;
			}
		});

		// Convert to array and sort by count (highest to lowest)
		const result = Object.entries(mentionCounts)
			.map(([name, count]) => ({ name, count }))
			.filter(item => typeof item.count === 'number' && !isNaN(item.count)) // Filter out invalid data
			.sort((a, b) => b.count - a.count);
		
		return result;
	};

	// Calculate web query statistics
	const calculateWebQueryStats = () => {
		if (!promptRuns?.runs) return { overall: [], byModel: {} };

		const overallQueryCounts: Record<string, number> = {};
		const modelQueryCounts: Record<string, Record<string, number>> = {};

		// Count all web queries
		promptRuns.runs.forEach((run) => {
			if (run.webQueries && run.webQueries.length > 0) {
				const modelGroup = run.modelGroup;

				// Initialize model group if not exists
				if (!modelQueryCounts[modelGroup]) {
					modelQueryCounts[modelGroup] = {};
				}

				run.webQueries.forEach((query) => {
					// Overall counts
					overallQueryCounts[query] = (overallQueryCounts[query] || 0) + 1;
					
					// Model-specific counts
					modelQueryCounts[modelGroup][query] = (modelQueryCounts[modelGroup][query] || 0) + 1;
				});
			}
		});

		// Convert overall to sorted array
		const overall = Object.entries(overallQueryCounts)
			.map(([query, count]) => ({ name: query, count }))
			.filter(item => typeof item.count === 'number' && !isNaN(item.count))
			.sort((a, b) => b.count - a.count)
			.slice(0, 20); // Limit to top 20 queries

		// Convert model stats to sorted arrays
		const byModel = Object.entries(modelQueryCounts).reduce((acc, [model, queries]) => {
			acc[model] = Object.entries(queries)
				.map(([query, count]) => ({ name: query, count }))
				.filter(item => typeof item.count === 'number' && !isNaN(item.count))
				.sort((a, b) => b.count - a.count)
				.slice(0, 15); // Limit to top 15 per model
			return acc;
		}, {} as Record<string, { name: string; count: number }[]>);

		return { overall, byModel };
	};

	// Only calculate stats when we have data and aren't loading
	const mentionStats = (!loading && promptRuns) ? calculateMentionStats() : [];
	const webQueryStats = (!loading && promptRuns) ? calculateWebQueryStats() : { overall: [], byModel: {} };

	// Calculate web search usage summary
	const calculateWebSearchSummary = () => {
		if (!promptRuns?.runs) return { enabled: 0, disabled: 0, percentage: 0 };
		
		const enabled = promptRuns.runs.filter(run => run.webSearchEnabled).length;
		const disabled = promptRuns.runs.length - enabled;
		const percentage = promptRuns.runs.length > 0 ? Math.round((enabled / promptRuns.runs.length) * 100) : 0;
		
		return { enabled, disabled, percentage };
	};

	const webSearchSummary = (!loading && promptRuns) ? calculateWebSearchSummary() : { enabled: 0, disabled: 0, percentage: 0 };

	if (loading) {
		return (
			<div className="container mx-auto p-6 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Prompt History</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (error) {
		return (
			<div className="container mx-auto p-6 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Prompt History</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">{error}</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!promptRuns) {
		return (
			<div className="container mx-auto p-6 space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Prompt History</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-muted-foreground">No prompt data found.</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<h1 className="text-3xl font-bold">{promptRuns.prompt.value}</h1>
			
			{/* Mention Statistics */}
			{!loading && promptRuns && (
				<Card>
					<CardHeader>
						<CardTitle>Mentions</CardTitle>
						<CardDescription>
									{brand?.name} was mentioned in{' '}
									<strong>
										{Math.round((mentionStats.find(stat => stat.name === brand?.name)?.count || 0) / (promptRuns?.runs?.length || 1) * 100)}%
									</strong>{' '}
									of prompt evaluations.
						</CardDescription>
					</CardHeader>
					<Separator />
					<CardContent>
						<HorizontalBarChart
							data={mentionStats}
							color="#3b82f6"
							tooltipLabel="Mentions"
							highlightValue={brand?.name}
							tickComponent={BrandYAxisTick}
							maxValue={promptRuns.runs.length}
						/>
					</CardContent>
				</Card>
			)}

			{/* Web Query Statistics */}
			{!loading && promptRuns && (
				<Card>
					<CardHeader>
						<CardTitle>Web Queries</CardTitle>
						<CardDescription>These are the underlying queries used by the LLMs to search for information relevant to the prompt.</CardDescription>
					</CardHeader>
					<Separator />
					
					{/* Overall Web Queries */}
					{webQueryStats.overall.length > 0 && (
						<CardContent className="pb-0">
							<div>
								<h4 className="text-sm font-medium mb-3">All</h4>
								<HorizontalBarChart
									data={webQueryStats.overall}
									color="#10b981"
									tooltipLabel="Uses"
									maxValue={promptRuns.runs.length}
								/>
							</div>
						</CardContent>
					)}

					{/* Separator between overall and model-specific queries */}
					{webQueryStats.overall.length > 0 && 
					 webQueryStats.byModel && 
					 Object.entries(webQueryStats.byModel).filter(([model, queries]) => queries.length > 0).length > 0 && (
						<Separator />
					)}

					{/* Web Queries by Model */}
					{webQueryStats.byModel && Object.entries(webQueryStats.byModel)
						.filter(([model, queries]) => queries.length > 0)
						.map(([model, queries], index, filteredEntries) => (
							<div key={model}>
								<CardContent className="pb-0">
									<h4 className="text-sm font-medium mb-3">
										{getModelDisplayName(model)}
									</h4>
									<HorizontalBarChart
										data={queries}
										color="#8b5cf6"
										tooltipLabel="Uses"
										maxValue={promptRuns.runs.length}
									/>
								</CardContent>
								{/* Separator between model sections (not after the last one) */}
								{index < filteredEntries.length - 1 && <Separator className="mt-6" />}
							</div>
						))}

					{webQueryStats.overall.length === 0 && Object.keys(webQueryStats.byModel).length === 0 && (
						<CardContent>
							<div className="text-muted-foreground text-center py-8">
								No web queries found in the prompt runs
							</div>
						</CardContent>
					)}
				</Card>
			)}

			<h2 className="text-2xl font-bold">Prompt Runs ({promptRuns.runs.length})</h2>

	
					{promptRuns.runs.length === 0 ? (
						<p className="text-muted-foreground">No prompt runs found for this prompt.</p>
					) : (
						<div className="space-y-6">
							{promptRuns.runs.map((run, index) => (
								<Card key={run.id} className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
									<CardHeader className="pb-0 gap-y-0">
									<div className="grid grid-cols-3 gap-x-4">
											<div>
												<strong className="text-sm text-gray-700 block">Model Group</strong> 
												<span className="text-sm text-gray-600">{getModelDisplayName(run.modelGroup)}</span>
											</div>
											<div>
												<strong className="text-sm text-gray-700 block">Model</strong> 
												<span className="text-sm text-gray-600">{run.model}</span>
											</div>
											<div>
												<strong className="text-sm text-gray-700 block">Evaluated</strong> 
												<span className="text-sm text-gray-600">{formatDate(run.createdAt)}</span>
											</div>
										</div>
									</CardHeader>
									<Separator />
									<CardContent className="space-y-6">
									
										{run.webQueries && run.webQueries.length > 0 && (
											<div>
												<strong className="text-sm text-gray-700 block mb-2">Web Queries</strong>
												<div className="flex flex-wrap gap-2">
													{run.webQueries.map((query, qIndex) => (
														<Badge key={qIndex} variant="outline" className="text-xs">
															{query}
														</Badge>
													))}
												</div>
											</div>
										)}

										<div>
											<strong className="text-sm text-gray-700 block mb-2">Brands Mentioned</strong>
											<div className="flex flex-wrap gap-2">
												{run.brandMentioned && brand?.name && (
													<Badge className="text-xs">
														{brand.name}
													</Badge>
												)}
												{run.competitorsMentioned && run.competitorsMentioned.map((competitor, cIndex) => (
													<Badge key={cIndex} variant="outline" className="text-xs">
														{competitor}
													</Badge>
												))}
												{!run.brandMentioned && (!run.competitorsMentioned || run.competitorsMentioned.length === 0) && (
													<Badge variant="secondary" className="text-xs">
														None
													</Badge>
												)}
											</div>
										</div>

										<div>
											<strong className="text-sm text-gray-700 block mb-2">Generated Text</strong>
											<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-h-64 overflow-auto">
												<pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
													{extractTextContent(run.rawOutput, run.modelGroup)}
												</pre>
											</div>
										</div>

										<div>
											<strong className="text-sm text-gray-700 block mb-2">Raw LLM Output</strong>
											<div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-auto">
												<pre className="text-xs text-gray-700 font-mono leading-relaxed">
													{formatRawOutput(run.rawOutput)}
												</pre>
											</div>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
		</div>
	);
} 