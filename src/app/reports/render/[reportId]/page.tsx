import { hasReportGeneratorAccess } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { reports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PromptChartPrint } from "@/components/prompt-chart-print";
import { PromptGroupChartPrint } from "@/components/prompt-group-chart-print";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { calculateVisibilityPercentages, calculateGroupVisibilityData, selectCompetitorsToDisplay } from "@/lib/chart-utils";
import { Target, BarChart3, Rocket } from "lucide-react";

// Types matching the report worker output
interface ReportData {
	websiteAnalysis: any;
	competitors: CompetitorResult[];
	keywords: any[];
	personaGroups: any[];
	prompts: PromptData[];
	promptRuns: PromptRunResult[];
}

interface CompetitorResult {
	name: string;
	domain: string;
}

interface PromptData {
	value: string;
	groupCategory: string | null;
	groupPrefix: string | null;
}

interface PromptRunResult {
	promptValue: string;
	runs: Array<{
		modelGroup: "openai" | "anthropic" | "google";
		model: string;
		webSearchEnabled: boolean;
		rawOutput: any;
		webQueries: string[];
		textContent: string;
		brandMentioned: boolean;
		competitorsMentioned: string[];
	}>;
}

// Mock structures to match frontend types
interface MockPrompt {
	id: string;
	brandId: string;
	value: string;
	enabled: boolean;
	groupCategory: string | null;
	groupPrefix: string | null;
	createdAt: Date;
}

interface MockPromptRun {
	id: string;
	promptId: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: Date;
}

// Calculate average AI visibility
function calculateAverageVisibility(
	prompts: MockPrompt[],
	promptRuns: MockPromptRun[],
	brandName: string,
	competitors: CompetitorResult[]
): number {
	if (!prompts || prompts.length === 0) {
		return 0;
	}

	// Filter to only enabled prompts
	const enabledPrompts = prompts.filter((prompt) => prompt.enabled);
	if (enabledPrompts.length === 0) {
		return 0;
	}

	// Get recent runs (all of them since report data is recent)
	const enabledPromptIds = new Set(enabledPrompts.map((prompt) => prompt.id));
	const recentRuns = promptRuns.filter((run) => enabledPromptIds.has(run.promptId));

	if (recentRuns.length === 0) {
		return 0;
	}

	// Group runs by promptId
	const runsByPrompt = new Map<string, MockPromptRun[]>();
	for (const run of recentRuns) {
		if (!runsByPrompt.has(run.promptId)) {
			runsByPrompt.set(run.promptId, []);
		}
		runsByPrompt.get(run.promptId)!.push(run);
	}

	// Filter out prompts that have no brand or competitor mentions
	const qualifyingRuns: MockPromptRun[] = [];
	for (const [promptId, runs] of runsByPrompt) {
		const hasAnyMentions = runs.some(
			(run) => run.brandMentioned || (run.competitorsMentioned && run.competitorsMentioned.length > 0)
		);

		if (hasAnyMentions) {
			qualifyingRuns.push(...runs);
		}
	}

	if (qualifyingRuns.length === 0) {
		return 0;
	}

	// Calculate the percentage of runs with brand mentions
	const brandMentionedCount = qualifyingRuns.filter((run) => run.brandMentioned).length;
	return Math.round((brandMentionedCount / qualifyingRuns.length) * 100);
}

// Calculate weighted mention score for a single prompt (matches prompts-display logic)
function calculatePromptMentionScore(promptId: string, promptRuns: MockPromptRun[], competitors: CompetitorResult[]): number {
	const runs = promptRuns.filter(run => run.promptId === promptId);
	if (runs.length === 0) return 0;

	const totalMentions = runs.reduce((total, run) => {
		let mentions = 0;
		// Count brand mention (weighted 2x)
		if (run.brandMentioned) mentions += 2;
		// Count each competitor mention separately (weighted 1x) - only if name matches exactly
		if (run.competitorsMentioned && run.competitorsMentioned.length > 0) {
			const matchingCompetitorMentions = run.competitorsMentioned.filter(mentionedName =>
				competitors.some(competitor => competitor.name === mentionedName)
			);
			mentions += matchingCompetitorMentions.length;
		}
		return total + mentions;
	}, 0);

	return totalMentions / runs.length; // Average weighted mentions per run
}

// Calculate weighted mention score for a group of prompts (matches prompts-display logic)
function calculateGroupMentionScore(groupPrompts: MockPrompt[], promptRuns: MockPromptRun[], competitors: CompetitorResult[]): number {
	const allRunsForGroup = groupPrompts.flatMap(prompt => 
		promptRuns.filter(run => run.promptId === prompt.id)
	);
	
	if (allRunsForGroup.length === 0) return 0;

	const totalMentions = allRunsForGroup.reduce((total, run) => {
		let mentions = 0;
		// Count brand mention (weighted 2x)
		if (run.brandMentioned) mentions += 2;
		// Count each competitor mention separately (weighted 1x) - only if name matches exactly
		if (run.competitorsMentioned && run.competitorsMentioned.length > 0) {
			const matchingCompetitorMentions = run.competitorsMentioned.filter(mentionedName =>
				competitors.some(competitor => competitor.name === mentionedName)
			);
			mentions += matchingCompetitorMentions.length;
		}
		return total + mentions;
	}, 0);

	return totalMentions / allRunsForGroup.length; // Average weighted mentions per run
}

// Calculate brand visibility percentage for a single prompt
function calculatePromptBrandVisibility(promptId: string, promptRuns: MockPromptRun[]): number {
	const runs = promptRuns.filter(run => run.promptId === promptId);
	if (runs.length === 0) return 0;

	const brandMentionedCount = runs.filter(run => run.brandMentioned).length;
	return Math.round((brandMentionedCount / runs.length) * 100);
}

// Calculate brand visibility percentage for a group of prompts
function calculateGroupBrandVisibility(groupPrompts: MockPrompt[], promptRuns: MockPromptRun[]): number {
	const allRunsForGroup = groupPrompts.flatMap(prompt => 
		promptRuns.filter(run => run.promptId === prompt.id)
	);
	
	if (allRunsForGroup.length === 0) return 0;

	const brandMentionedCount = allRunsForGroup.filter(run => run.brandMentioned).length;
	return Math.round((brandMentionedCount / allRunsForGroup.length) * 100);
}

function getVisibilityTextColor(value: number): string {
	if (value > 75) return "text-emerald-600";
	if (value > 45) return "text-amber-500";
	return "text-rose-500";
}

// Types for display items
type DisplayItem = {
	type: "individual" | "group";
	mentionScore: number;
	brandVisibility: number;
	hasRuns: boolean;
	data: MockPrompt | { groupKey: string; prompts: MockPrompt[] };
};

export default async function ReportRenderPage({
	params,
}: {
	params: Promise<{ reportId: string }>;
}) {
	const { reportId } = await params;

	// Validate reportId
	if (!reportId || typeof reportId !== "string") {
		notFound();
	}

	// Fetch the report from database
	const report = await db
		.select()
		.from(reports)
		.where(eq(reports.id, reportId))
		.limit(1)
		.then((res) => res[0]);

	if (!report) {
		notFound();
	}

	// Check if report is completed
	if (report.status !== "completed") {
		return (
			<div className="max-w-4xl mx-auto p-8">
				<Card>
					<CardContent className="py-8 text-center">
						<p className="text-muted-foreground">Report is not completed yet. Status: {report.status}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const parsedReportData: ReportData = report.rawOutput as ReportData;

	// Transform data to match frontend types
	const mockBrand = {
		id: "brand-1",
		name: report.brandName,
		website: report.brandWebsite,
		enabled: true,
		onboarded: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockCompetitors = parsedReportData.competitors.map((comp, index) => ({
		id: `comp-${index + 1}`,
		name: comp.name,
		createdAt: new Date(),
		updatedAt: new Date(),
		brandId: mockBrand.id,
		domain: comp.domain,
	}));

	const mockPrompts: MockPrompt[] = parsedReportData.prompts.map((prompt, index) => ({
		id: `prompt-${index + 1}`,
		brandId: mockBrand.id,
		value: prompt.value,
		enabled: true,
		groupCategory: prompt.groupCategory,
		groupPrefix: prompt.groupPrefix,
		createdAt: new Date(),
	}));

	// Create prompt runs from report data  
	const mockPromptRuns: MockPromptRun[] = [];
	const fullPromptRuns: any[] = [];
	
	parsedReportData.promptRuns.forEach((promptRunResult, promptIndex) => {
		(promptRunResult.runs as any[]).forEach((run, runIndex) => {
			const promptRunData = {
				id: `run-${promptIndex}-${runIndex}`,
				promptId: `prompt-${promptIndex + 1}`,
				brandMentioned: run.brandMentioned,
				competitorsMentioned: run.competitorsMentioned,
				createdAt: new Date(),
			};
			
			const fullPromptRunData = {
				...promptRunData,
				modelGroup: run.modelGroup,
				model: run.model,
				webSearchEnabled: run.webSearchEnabled,
				rawOutput: run.rawOutput,
				webQueries: run.webQueries,
			};
			
			mockPromptRuns.push(promptRunData);
			fullPromptRuns.push(fullPromptRunData);
		});
	});

	// Calculate overall AI visibility
	const averageVisibility = calculateAverageVisibility(
		mockPrompts,
		mockPromptRuns,
		report.brandName,
		parsedReportData.competitors
	);

	// Group prompts similar to prompts-display
	const uncategorizedPrompts = mockPrompts.filter(
		(prompt) => !prompt.groupCategory || prompt.groupCategory === "Uncategorized",
	);

	const groupedPrompts = mockPrompts
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
			{} as Record<string, MockPrompt[]>,
		);

	// Create display items for individual prompts
	const individualItems: DisplayItem[] = uncategorizedPrompts.map((prompt) => {
		const runs = mockPromptRuns.filter(run => run.promptId === prompt.id);
		const hasRuns = runs.length > 0;
		const mentionScore = calculatePromptMentionScore(prompt.id, mockPromptRuns, parsedReportData.competitors);
		const brandVisibility = calculatePromptBrandVisibility(prompt.id, mockPromptRuns);

		return {
			type: "individual" as const,
			mentionScore,
			brandVisibility,
			hasRuns,
			data: prompt,
		};
	});

	// Create display items for groups
	const groupItems: DisplayItem[] = Object.entries(groupedPrompts).map(([groupKey, groupPrompts]) => {
		const allRunsForGroup = groupPrompts.flatMap(prompt => 
			mockPromptRuns.filter(run => run.promptId === prompt.id)
		);
		const hasRuns = allRunsForGroup.length > 0;
		const mentionScore = calculateGroupMentionScore(groupPrompts, mockPromptRuns, parsedReportData.competitors);
		const brandVisibility = calculateGroupBrandVisibility(groupPrompts, mockPromptRuns);

		return {
			type: "group" as const,
			mentionScore,
			brandVisibility,
			hasRuns,
			data: { groupKey, prompts: groupPrompts },
		};
	});

	// Combine and sort all items by mention score (descending), then alphabetically  
	const allDisplayItems = [...individualItems, ...groupItems].sort((a, b) => {
		// First sort by mention score (descending)
		if (a.mentionScore !== b.mentionScore) {
			return b.mentionScore - a.mentionScore;
		}

		// Then sort alphabetically
		const nameA = a.type === "individual" 
			? (a.data as MockPrompt).value
			: (() => {
				const { groupKey } = a.data as { groupKey: string; prompts: MockPrompt[] };
				return groupKey.includes(":") ? groupKey.split(":")[1] : groupKey;
			})();

		const nameB = b.type === "individual"
			? (b.data as MockPrompt).value
			: (() => {
				const { groupKey } = b.data as { groupKey: string; prompts: MockPrompt[] };
				return groupKey.includes(":") ? groupKey.split(":")[1] : groupKey;
			})();

		return nameA.localeCompare(nameB);
	});

	// Filter items that would show "No brands found" - use the same logic as the chart components
	const hasVisibilityData = (item: DisplayItem): boolean => {
		if (item.type === "individual") {
			const prompt = item.data as MockPrompt;
			const promptSpecificRuns = fullPromptRuns.filter(run => run.promptId === prompt.id);
			
			// Calculate chart data first 
			const chartData = calculateVisibilityPercentages(promptSpecificRuns, mockBrand, mockCompetitors, "1m");
			
			// Select top competitors by visibility, filling with alphabetical order if needed
			const selectedCompetitors = selectCompetitorsToDisplay(mockCompetitors, chartData, 5);
			
			// Check if there's any non-zero visibility data for brand or selected competitors
			const hasData = chartData.some((dataPoint) => {
				// Check brand visibility
				const brandVisibility = dataPoint[mockBrand.id] as number;
				if (brandVisibility !== null && brandVisibility !== undefined && Number(brandVisibility) > 0) {
					return true;
				}
				
				// Check selected competitor visibility
				return selectedCompetitors.some(competitor => {
					const visibility = dataPoint[competitor.id] as number;
					return visibility !== null && visibility !== undefined && Number(visibility) > 0;
				});
			});
			
			return hasData;
		} else {
			const group = item.data as { groupKey: string; prompts: MockPrompt[] };
			
			// Get all runs for prompts in this group
			const groupPromptIds = group.prompts.map(p => p.id);
			const groupPromptRuns = fullPromptRuns.filter(run => groupPromptIds.includes(run.promptId));
			
			// Calculate group visibility data first
			const groupVisibilityData = calculateGroupVisibilityData(fullPromptRuns, group.prompts, mockBrand, mockCompetitors, "1m");
			
			// Select top competitors by visibility, filling with alphabetical order if needed
			const allChartData = groupVisibilityData.flatMap(promptData => promptData.chartData);
			const selectedCompetitors = selectCompetitorsToDisplay(mockCompetitors, allChartData, 4);
			
			// Check if there's any non-zero visibility data for brand or selected competitors
			return groupVisibilityData.some((promptData) => {
				return promptData.chartData.some((dataPoint) => {
					// Check brand visibility
					const brandVisibility = dataPoint[mockBrand.id] as number;
					if (brandVisibility !== null && brandVisibility !== undefined && Number(brandVisibility) > 0) {
						return true;
					}
					
					// Check selected competitor visibility
					return selectedCompetitors.some(competitor => {
						const visibility = dataPoint[competitor.id] as number;
						return visibility !== null && visibility !== undefined && Number(visibility) > 0;
					});
				});
			});
		}
	};

	// Filter items with visibility data and limit to top 4
	const itemsWithVisibility = allDisplayItems.filter(hasVisibilityData);
	const topDisplayItems = itemsWithVisibility.slice(0, 4);
	const remainingItems = itemsWithVisibility.slice(4);

	return (
		<div className="max-w-4xl mx-auto p-6 print:pt-8">
			{/* Header with White Label Branding */}
			<div className="flex items-center justify-between mb-32">
				<h1 className="text-3xl font-bold text-gray-900">AI Visibility Report</h1>
				<div className="flex items-center space-x-3">
					<img src={WHITE_LABEL_CONFIG.icon} alt="Logo" className="!size-6" />
					<span className="text-base font-semibold">{WHITE_LABEL_CONFIG.name}</span>
				</div>
			</div>

			{/* Metrics Grid */}
			<div className="grid grid-cols-2 gap-4 mb-8">
				<Card className="print:shadow-none">
					<CardHeader>
						<CardDescription>Brand</CardDescription>
						<CardTitle className="text-3xl">{report.brandName}</CardTitle>
					</CardHeader>
				</Card>
				<Card className="print:shadow-none">
					<CardHeader>
						<CardDescription>AI Visibility</CardDescription>
						<CardTitle className="text-3xl"><span className={`font-bold ${getVisibilityTextColor(averageVisibility)}`}>
							{averageVisibility}%
						</span></CardTitle>
					</CardHeader>
				</Card>
			</div>

			{/* What is AEO Section */}
			<Card className="print:shadow-none mb-6">
				<CardContent className="space-y-3">
					<p className="text-gray-700 text-sm leading-normal">
						<strong>Answer Engine Optimization (AEO)</strong>, also known as Generative Engine Optimization (GEO), is the practice of optimizing content to be discovered and cited by AI-powered search engines and chatbots like ChatGPT, Claude, Perplexity, and Google's AI Overviews.
					</p>
					<p className="text-gray-700 text-sm leading-normal">
						Unlike traditional SEO which focuses on ranking websites in search results, AEO aims to have your brand mentioned directly in AI-generated responses. When users ask questions, AI engines synthesize information from the web and provide conversational answers. AEO ensures your brand is part of those answers.
					</p>
					<div className="bg-blue-50 border-l-4 border-blue-400 p-3">
						<p className="text-blue-800 font-medium text-sm">
							Only around 12% of sources cited by ChatGPT overlap with traditional Google search results, meaning most traditional SEO strategies may not translate to AI visibility.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* AI Visibility Section */}
			<Card className="print:shadow-none mb-6">
				<CardContent className="space-y-3">
					<p className="text-gray-700 text-sm leading-normal">
						<strong>AI Visibility</strong> measures how often your brand appears in AI-generated responses. It's calculated by running relevant prompts through major AI engines and tracking brand mentions.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
						<div className="text-center p-3 bg-emerald-50 rounded-lg">
							<div className="text-xl font-bold text-emerald-600 mb-1">75%+</div>
							<div className="text-xs text-emerald-700 font-semibold">Excellent Visibility</div>
							<div className="text-xs text-emerald-700">AI finds your brand.</div>
						</div>
						<div className="text-center p-3 bg-amber-50 rounded-lg">
							<div className="text-xl font-bold text-amber-600 mb-1">45-75%</div>
							<div className="text-xs text-amber-700 font-semibold">Good Visibility</div>
							<div className="text-xs text-amber-700">Room for improvement.</div>
						</div>
						<div className="text-center p-3 bg-rose-50 rounded-lg">
							<div className="text-xl font-bold text-rose-600 mb-1">&lt;45%</div>
							<div className="text-xs text-rose-700 font-semibold">Low Visibility</div>
							<div className="text-xs text-rose-700">Optimization needed.</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Charts */}
			{topDisplayItems.length === 0 ? (
				<Card className="print:shadow-none">
					<CardContent className="py-8 text-center">
						<p className="text-muted-foreground">No prompts with visibility data found.</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-6 print:break-before-page">
					<h2 className="text-xl font-bold text-gray-900 mb-4">
						Top Prompt Visibility Charts
					</h2>

					{topDisplayItems.map((item, index) => (
						<div key={index} className="print:break-inside-avoid">
							{item.type === "individual" ? (
								<PromptChartPrint
									lookback="1m"
									promptName={(item.data as MockPrompt).value}
									promptId={(item.data as MockPrompt).id}
									brand={mockBrand}
									competitors={mockCompetitors}
									promptRuns={fullPromptRuns}
								/>
							) : (
								(() => {
									const group = item.data as { groupKey: string; prompts: MockPrompt[] };
									const firstPrompt = group.prompts[0];
									const groupCategory = firstPrompt?.groupCategory || "Uncategorized";
									const groupPrefix = firstPrompt?.groupPrefix;
									const chartName = groupPrefix ? `${groupPrefix} ${groupCategory}` : groupCategory;

									return (
										<PromptGroupChartPrint
											lookback="1m"
											groupName={chartName}
											prompts={group.prompts}
											brand={mockBrand}
											competitors={mockCompetitors}
											promptRuns={fullPromptRuns}
										/>
									);
								})()
							)}
						</div>
					))}
				</div>
			)}

			{/* Remaining Prompts */}
			{remainingItems.length > 0 && (
				<div className="mt-8 print-break-before print-page-center">
					<Card className="print:shadow-none">
						<CardHeader>
							<CardTitle className="text-lg">Additional Prompts</CardTitle>
													<CardDescription>
								Here are some additional prompts to track for {report.brandName}.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
								{remainingItems.flatMap((item, groupIndex) => {
									if (item.type === "individual") {
										const prompt = item.data as MockPrompt;
										return [{
											key: `individual-${groupIndex}`,
											name: prompt.value,
											visibility: item.brandVisibility
										}];
									} else {
										// Expand group into individual prompts
										const group = item.data as { groupKey: string; prompts: MockPrompt[] };
										return group.prompts.map((prompt, promptIndex) => {
											const individualVisibility = calculatePromptBrandVisibility(prompt.id, mockPromptRuns);
											return {
												key: `group-${groupIndex}-prompt-${promptIndex}`,
												name: prompt.value,
												visibility: individualVisibility
											};
										});
									}
																}).slice(0, 36).map((promptItem) => (
									<div key={promptItem.key} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded text-xs">
										<span className="text-ellipsis w-3/4 text-gray-700">
											{promptItem.name}
										</span>
										<span className="text-gray-700">
											{promptItem.visibility}%
										</span>
									</div>
								))}			
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Optimization Opportunities Section */}
			<div className="mt-8 print:break-before">
				<Card className="print:shadow-none">
					<CardHeader>
						<CardTitle className="text-xl text-slate-800">What should I do next?</CardTitle>
						<CardDescription className="text-slate-700">
							Prompts where competitors are outperforming {report.brandName} are your biggest opportunities for improvement.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{(() => {
							// Get all individual prompts (expand groups)
							const allIndividualPrompts = [
								...uncategorizedPrompts,
								...Object.values(groupedPrompts).flat()
							];

							// Calculate competitive analysis for each prompt
							const competitiveAnalysis = allIndividualPrompts.map(prompt => {
								const promptRuns = mockPromptRuns.filter(run => run.promptId === prompt.id);
								if (promptRuns.length === 0) return null;

								// Calculate brand visibility
								const brandVisibility = calculatePromptBrandVisibility(prompt.id, mockPromptRuns);

								// Calculate competitor visibilities
								const competitorVisibilities = parsedReportData.competitors.map(competitor => {
									const competitorMentions = promptRuns.filter(run => 
										run.competitorsMentioned && run.competitorsMentioned.includes(competitor.name)
									).length;
									return Math.round((competitorMentions / promptRuns.length) * 100);
								});

								// Find competitors with higher visibility than brand
								const higherCompetitorVisibilities = competitorVisibilities.filter(vis => vis > brandVisibility);
								
								if (higherCompetitorVisibilities.length === 0) return null;

								// Calculate average of higher-performing competitors
								const avgCompetitorVisibility = Math.round(
									higherCompetitorVisibilities.reduce((sum, vis) => sum + vis, 0) / higherCompetitorVisibilities.length
								);

								// Calculate gap (how much better competitors are)
								const visibilityGap = avgCompetitorVisibility - brandVisibility;

								// Calculate goal visibility (5-15% higher than competitor average, capped at 100%)
								const goalIncrease = Math.floor(Math.random() * 11) + 5; // 5-15%
								const goalVisibility = Math.min(100, avgCompetitorVisibility + goalIncrease);

								// Determine difficulty based on current brand visibility
								let difficulty: "Easy" | "Medium" | "Hard";
								if (brandVisibility <= 20) difficulty = "Hard";
								else if (brandVisibility <= 60) difficulty = "Medium";
								else difficulty = "Easy";

								return {
									prompt: prompt.value,
									brandVisibility,
									avgCompetitorVisibility,
									goalVisibility,
									difficulty,
									visibilityGap
								};
							}).filter(Boolean) as Array<{
								prompt: string;
								brandVisibility: number;
								avgCompetitorVisibility: number;
								goalVisibility: number;
								difficulty: "Easy" | "Medium" | "Hard";
								visibilityGap: number;
							}>;

							// Sort by visibility gap (biggest opportunities first), prioritizing non-zero brand visibility
							const topOpportunities = competitiveAnalysis
								.sort((a, b) => {
									// First prioritize prompts with non-zero brand visibility
									if (a.brandVisibility > 0 && b.brandVisibility === 0) return -1;
									if (a.brandVisibility === 0 && b.brandVisibility > 0) return 1;
									// Then sort by visibility gap (biggest opportunities first)
									return b.visibilityGap - a.visibilityGap;
								})
								.slice(0, 5);

							if (topOpportunities.length === 0) {
								return (
									<div className="text-center py-8">
										<p className="text-muted-foreground">No competitive optimization opportunities found.</p>
									</div>
								);
							}

							return (
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b">
												<th className="text-left py-3 px-2 font-semibold">Prompt</th>
												<th className="text-center py-3 px-2 font-semibold">Current Visibility</th>
												<th className="text-center py-3 px-2 font-semibold">Competitor Visibility</th>
												<th className="text-center py-3 px-2 font-semibold">Goal Visibility</th>
												<th className="text-center py-3 px-2 font-semibold">Difficulty</th>
												<th className="text-left py-3 px-2 font-semibold">Recommendation</th>
											</tr>
										</thead>
										<tbody>
											{topOpportunities.map((opportunity, index) => (
												<tr key={index} className="border-b border-gray-100">
													<td className="py-3 px-2 max-w-xs">
														<div className="text-xs text-gray-700 break-words">
															{opportunity.prompt}
														</div>
													</td>
													<td className="text-center py-3 px-2">
														<span className="text-xs text-gray-700">
															{opportunity.brandVisibility}%
														</span>
													</td>
													<td className="text-center py-3 px-2">
														<span className="text-xs text-gray-700">
															{opportunity.avgCompetitorVisibility}%
														</span>
													</td>
													<td className="text-center py-3 px-2">
														<span className="text-xs text-gray-700">
															{opportunity.goalVisibility}%
														</span>
													</td>
													<td className="text-center py-3 px-2">
														<span className="text-xs text-gray-700">
															{opportunity.difficulty}
														</span>
													</td>
													<td className="py-3 px-2 text-xs text-gray-700">
														Create LLM-optimized articles on "{opportunity.prompt}"
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							);
						})()}
					</CardContent>
				</Card>
			</div>

			{/* Call to Action Section */}
			<div className="mt-8 print:break-before">
				<Card className="print:shadow-none bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl text-slate-800">Ready to Optimize Your AI Visibility?</CardTitle>
						<CardDescription className="text-slate-700 text-base">
							Take your brand's AI presence to the next level with {WHITE_LABEL_CONFIG.name}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="text-center p-4">
								<div className="flex justify-center mb-2">
									<Target className="h-8 w-8 text-slate-600" />
								</div>
								<h3 className="font-semibold text-slate-800 mb-2">Strategic Optimization</h3>
								<p className="text-sm text-slate-700">Develop content strategies that increase your brand mentions in AI responses</p>
							</div>
							<div className="text-center p-4">
								<div className="flex justify-center mb-2">
									<BarChart3 className="h-8 w-8 text-slate-600" />
								</div>
								<h3 className="font-semibold text-slate-800 mb-2">Continuous Monitoring</h3>
								<p className="text-sm text-slate-700">Track your AI visibility across hundreds of relevant prompts and topics</p>
							</div>
							<div className="text-center p-4">
								<div className="flex justify-center mb-2">
									<Rocket className="h-8 w-8 text-slate-600" />
								</div>
								<h3 className="font-semibold text-slate-800 mb-2">Competitive Advantage</h3>
								<p className="text-sm text-slate-700">Stay ahead of competitors in the rapidly evolving AI search landscape</p>
							</div>
						</div>
						<div className="text-center pt-4 border-t border-blue-200">
							<p className="text-slate-800 font-medium mb-2">Get started with {WHITE_LABEL_CONFIG.name} today</p>
							<p className="text-slate-700 text-sm">
								Visit <strong>{WHITE_LABEL_CONFIG.url}</strong> to learn more about our AEO platform and services.
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
} 