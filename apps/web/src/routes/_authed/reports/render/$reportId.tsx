/**
 * /reports/render/$reportId - Standalone report rendering page
 *
 * Displays a completed report with charts, analysis tables, and branding.
 * Designed for printing / PDF export.
 * Replicates: apps/web/src/app/reports/render/[reportId]/page.tsx
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { requireAuthSession, hasReportAccess } from "@/lib/auth/helpers";
import { getReportByIdFn } from "@/server/reports";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { PromptChartPrint } from "@/components/prompt-chart-print";
import { Logo } from "@/components/logo";
import { Target, BarChart3, Rocket } from "lucide-react";
import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";

// ---------- Types matching the report worker output ----------

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

// Mock structures to match frontend component types
interface MockPrompt {
	id: string;
	brandId: string;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

interface MockPromptRun {
	id: string;
	promptId: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: Date;
}

type DisplayItem = {
	type: "individual";
	mentionScore: number;
	brandVisibility: number;
	hasRuns: boolean;
	isBranded: boolean;
	hasCompetitorMentions: boolean;
	data: MockPrompt;
};

// ---------- Server function ----------

const loadReportData = createServerFn({ method: "GET" })
	.inputValidator((d: string) => d)
	.handler(async ({ data: reportId }) => {
		const session = await requireAuthSession();
		const hasAccess = hasReportAccess(session);
		if (!hasAccess) throw new Error("Not authorized");

		const report = await getReportByIdFn({ data: { reportId } });
		return report;
	});

// ---------- Helper functions ----------

function calculateAverageVisibility(
	prompts: MockPrompt[],
	promptRuns: MockPromptRun[],
	_brandName: string,
	_competitors: CompetitorResult[],
): number {
	if (!prompts || prompts.length === 0) return 0;

	const enabledPrompts = prompts.filter((prompt) => prompt.enabled);
	if (enabledPrompts.length === 0) return 0;

	const enabledPromptIds = new Set(enabledPrompts.map((prompt) => prompt.id));
	const recentRuns = promptRuns.filter((run) => enabledPromptIds.has(run.promptId));
	if (recentRuns.length === 0) return 0;

	const runsByPrompt = new Map<string, MockPromptRun[]>();
	for (const run of recentRuns) {
		if (!runsByPrompt.has(run.promptId)) {
			runsByPrompt.set(run.promptId, []);
		}
		runsByPrompt.get(run.promptId)!.push(run);
	}

	const qualifyingRuns: MockPromptRun[] = [];
	for (const [, runs] of runsByPrompt) {
		const hasAnyMentions = runs.some(
			(run) => run.brandMentioned || (run.competitorsMentioned && run.competitorsMentioned.length > 0),
		);
		if (hasAnyMentions) {
			qualifyingRuns.push(...runs);
		}
	}
	if (qualifyingRuns.length === 0) return 0;

	const brandMentionedCount = qualifyingRuns.filter((run) => run.brandMentioned).length;
	return Math.round((brandMentionedCount / qualifyingRuns.length) * 100);
}

function calculatePromptMentionScore(
	promptId: string,
	promptRuns: MockPromptRun[],
	competitors: CompetitorResult[],
): number {
	const runs = promptRuns.filter((run) => run.promptId === promptId);
	if (runs.length === 0) return 0;

	const totalMentions = runs.reduce((total, run) => {
		let mentions = 0;
		if (run.brandMentioned) mentions += 2;
		if (run.competitorsMentioned && run.competitorsMentioned.length > 0) {
			const matchingCompetitorMentions = run.competitorsMentioned.filter((mentionedName) =>
				competitors.some((competitor) => competitor.name === mentionedName),
			);
			mentions += matchingCompetitorMentions.length;
		}
		return total + mentions;
	}, 0);

	return totalMentions / runs.length;
}

function calculatePromptBrandVisibility(promptId: string, promptRuns: MockPromptRun[]): number {
	const runs = promptRuns.filter((run) => run.promptId === promptId);
	if (runs.length === 0) return 0;
	const brandMentionedCount = runs.filter((run) => run.brandMentioned).length;
	return Math.round((brandMentionedCount / runs.length) * 100);
}

function getVisibilityTextColor(value: number): string {
	if (value > 75) return "text-emerald-600";
	if (value > 45) return "text-amber-500";
	return "text-rose-500";
}

function isPromptBranded(promptValue: string, brandName: string, brandWebsite: string): boolean {
	const promptLower = promptValue.toLowerCase();
	const brandNameLower = brandName.toLowerCase();

	try {
		const url = new URL(brandWebsite.startsWith("http") ? brandWebsite : `https://${brandWebsite}`);
		const domain = url.hostname.replace(/^www\./, "").toLowerCase();
		const domainWithoutTld = domain.split(".")[0];
		return promptLower.includes(brandNameLower) || promptLower.includes(domain) || promptLower.includes(domainWithoutTld);
	} catch {
		return promptLower.includes(brandNameLower);
	}
}

// ---------- Route ----------

export const Route = createFileRoute("/_authed/reports/render/$reportId")({
	loader: async ({ params }) => {
		const report = await loadReportData({ data: params.reportId });
		if (!report) throw notFound();
		return { report };
	},
	head: () => ({
		meta: [
			{ title: "AI Visibility Report" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: ReportRenderPage,
});

function ReportRenderPage() {
	const { report } = Route.useLoaderData();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const branding = context.clientConfig?.branding;

	if (report.status !== "completed") {
		return (
			<div className="max-w-4xl mx-auto p-8">
				<Card>
					<CardContent className="py-8 text-center">
						<p className="text-muted-foreground">
							Report is not completed yet. Status: {report.status}
						</p>
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
		delayOverrideHours: null,
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
		parsedReportData.competitors,
	);

	// Create display items for all prompts
	const individualItems: DisplayItem[] = mockPrompts.map((prompt) => {
		const runs = mockPromptRuns.filter((run) => run.promptId === prompt.id);
		const hasRuns = runs.length > 0;
		const mentionScore = calculatePromptMentionScore(prompt.id, mockPromptRuns, parsedReportData.competitors);
		const brandVisibility = calculatePromptBrandVisibility(prompt.id, mockPromptRuns);
		const isBranded = isPromptBranded(prompt.value, report.brandName, report.brandWebsite);
		const hasCompetitorMentions = runs.some(
			(run) => run.competitorsMentioned && run.competitorsMentioned.length > 0,
		);

		return {
			type: "individual" as const,
			mentionScore,
			brandVisibility,
			hasRuns,
			isBranded,
			hasCompetitorMentions,
			data: prompt,
		};
	});

	// Sort all items by mention score (descending), then alphabetically
	const allDisplayItems = [...individualItems].sort((a, b) => {
		if (a.mentionScore !== b.mentionScore) return b.mentionScore - a.mentionScore;
		return a.data.value.localeCompare(b.data.value);
	});

	const hasSimpleVisibilityData = (item: DisplayItem): boolean => {
		const runs = mockPromptRuns.filter((run) => run.promptId === item.data.id);
		return runs.some(
			(run) => run.brandMentioned || (run.competitorsMentioned && run.competitorsMentioned.length > 0),
		);
	};

	const itemsWithVisibility = allDisplayItems.filter(hasSimpleVisibilityData);

	// Smart selection: prefer non-branded prompts with both brand and competitor mentions
	const selectedDisplayItems: DisplayItem[] = [];
	const brandedItems: DisplayItem[] = [];
	const nonBrandedItems: DisplayItem[] = [];

	for (const item of itemsWithVisibility) {
		if (item.isBranded) {
			brandedItems.push(item);
		} else {
			nonBrandedItems.push(item);
		}
	}

	nonBrandedItems.sort((a, b) => {
		const aHasBrand = a.brandVisibility > 0;
		const bHasBrand = b.brandVisibility > 0;
		if (aHasBrand !== bHasBrand) return aHasBrand ? -1 : 1;
		if (a.hasCompetitorMentions !== b.hasCompetitorMentions) return a.hasCompetitorMentions ? -1 : 1;
		if (Math.abs(a.mentionScore - b.mentionScore) > 0.1) return b.mentionScore - a.mentionScore;
		return b.brandVisibility - a.brandVisibility;
	});

	brandedItems.sort((a, b) => {
		if (Math.abs(a.brandVisibility - b.brandVisibility) > 5) return b.brandVisibility - a.brandVisibility;
		return b.mentionScore - a.mentionScore;
	});

	selectedDisplayItems.push(...nonBrandedItems.slice(0, 3));
	const hasBrandMentionInFirst3 = selectedDisplayItems.some((item) => item.brandVisibility > 0);
	if (!hasBrandMentionInFirst3 && brandedItems.length > 0) {
		selectedDisplayItems.push(brandedItems[0]);
	} else if (selectedDisplayItems.length < 4) {
		const remainingNonBranded = nonBrandedItems.slice(selectedDisplayItems.length);
		const allRemaining = [...remainingNonBranded, ...brandedItems];
		if (allRemaining.length > 0) {
			selectedDisplayItems.push(allRemaining[0]);
		}
	}

	const topDisplayItems = selectedDisplayItems.slice(0, 4);

	return (
		<div className="max-w-4xl mx-auto p-6 print:pt-8">
			{/* Header with White Label Branding */}
			<div className="flex items-center justify-between mb-32 print:mb-8">
				<h1 className="text-3xl font-bold text-gray-900">AI Visibility Report</h1>
				<div className="flex items-center space-x-3">
					<Logo iconClassName="!size-6" textClassName="text-base font-semibold" />
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
						<CardTitle className="text-3xl">
							<span className={`font-bold ${getVisibilityTextColor(averageVisibility)}`}>
								{averageVisibility}%
							</span>
						</CardTitle>
					</CardHeader>
				</Card>
			</div>

			{/* What is AEO Section */}
			<Card className="print:shadow-none mb-6">
				<CardContent className="space-y-3">
					<p className="text-gray-700 text-sm leading-normal">
						<strong>Answer Engine Optimization (AEO)</strong>, also known as Generative Engine
						Optimization (GEO), is the practice of optimizing content to be discovered and cited by
						AI-powered search engines and chatbots like ChatGPT, Claude, Perplexity, and Google's AI
						Overviews.
					</p>
					<p className="text-gray-700 text-sm leading-normal">
						Unlike traditional SEO which focuses on ranking websites in search results, AEO aims to
						have your brand mentioned directly in AI-generated responses. When users ask questions, AI
						engines synthesize information from the web and provide conversational answers. AEO ensures
						your brand is part of those answers.
					</p>
					<div className="bg-blue-50 border-l-4 border-blue-400 p-3">
						<p className="text-blue-800 font-medium text-sm">
							Only around 12% of sources cited by ChatGPT overlap with traditional Google search
							results, meaning most traditional SEO strategies may not translate to AI visibility.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* AI Visibility Section */}
			<Card className="print:shadow-none mb-6">
				<CardContent className="space-y-3">
					<p className="text-gray-700 text-sm leading-normal">
						<strong>AI Visibility</strong> measures how often your brand appears in AI-generated
						responses. It's calculated by running relevant prompts through major AI engines and
						tracking brand mentions.
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
					<h2 className="text-xl font-bold text-gray-900 mb-4">Top Prompt Visibility Charts</h2>
					{topDisplayItems.map((item) => (
						<div key={item.data.id} className="print:break-inside-avoid">
							<PromptChartPrint
								lookback="1m"
								promptName={item.data.value}
								promptId={item.data.id}
								brand={mockBrand as any}
								competitors={mockCompetitors as any}
								promptRuns={fullPromptRuns}
							/>
						</div>
					))}
				</div>
			)}

			{/* AEO Opportunity and Optimization Sections Container */}
			<div className="print:break-before-page print:h-screen print:flex print:items-center print:justify-center">
				<div className="print:w-full space-y-8">
					{/* AEO Opportunity Section */}
					<div className="mt-8 print:mt-0">
						<Card className="print:shadow-none">
							<CardHeader>
								<CardTitle className="text-xl text-slate-800">AEO Opportunity</CardTitle>
								<CardDescription className="text-slate-700">
									Overview of your current AI visibility performance and growth potential.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<AEOOpportunityTable
									itemsWithVisibility={itemsWithVisibility}
								/>
							</CardContent>
						</Card>
					</div>

					{/* Optimization Opportunities Section */}
					<div>
						<Card className="print:shadow-none">
							<CardHeader>
								<CardTitle className="text-xl text-slate-800">
									What should I do next?
								</CardTitle>
								<CardDescription className="text-slate-700">
									Prompts where competitors are outperforming {report.brandName} are your
									biggest opportunities for improvement.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<OptimizationTable
									itemsWithVisibility={itemsWithVisibility}
									mockPromptRuns={mockPromptRuns}
									competitors={parsedReportData.competitors}
								/>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			{/* Call to Action Section */}
			<div className="mt-8 print:mt-0 print:break-before-page print:flex print:items-center print:justify-center print:mt-48">
				<Card className="print:shadow-none bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 print:w-full">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl text-slate-800">
							Ready to Optimize Your AI Visibility?
						</CardTitle>
						<CardDescription className="text-slate-700 text-base">
							Take your brand's AI presence to the next level with{" "}
							{branding?.name || "Elmo"}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div className="text-center p-4">
								<div className="flex justify-center mb-2">
									<Target className="h-8 w-8 text-slate-600" />
								</div>
								<h3 className="font-semibold text-slate-800 mb-2">
									Strategic Optimization
								</h3>
								<p className="text-sm text-slate-700">
									Develop content strategies that increase your brand mentions in AI
									responses
								</p>
							</div>
							<div className="text-center p-4">
								<div className="flex justify-center mb-2">
									<BarChart3 className="h-8 w-8 text-slate-600" />
								</div>
								<h3 className="font-semibold text-slate-800 mb-2">
									Continuous Monitoring
								</h3>
								<p className="text-sm text-slate-700">
									Track your AI visibility across hundreds of relevant prompts and topics
								</p>
							</div>
							<div className="text-center p-4">
								<div className="flex justify-center mb-2">
									<Rocket className="h-8 w-8 text-slate-600" />
								</div>
								<h3 className="font-semibold text-slate-800 mb-2">
									Competitive Advantage
								</h3>
								<p className="text-sm text-slate-700">
									Stay ahead of competitors in the rapidly evolving AI search landscape
								</p>
							</div>
						</div>
						<div className="text-center pt-4 border-t border-blue-200">
							<p className="text-slate-800 font-medium mb-2">
								Get started with {branding?.name || "Elmo"} today
							</p>
							<p className="text-slate-700 text-sm">
								Visit <strong>{branding?.url || "elmo.chat"}</strong> to learn more about
								our AEO platform and services.
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

// ---------- Sub-components ----------

function AEOOpportunityTable({ itemsWithVisibility }: { itemsWithVisibility: DisplayItem[] }) {
	const totalPromptsTracked = itemsWithVisibility.length;
	const promptsWithBrandMentions = itemsWithVisibility.filter(
		(item) => item.brandVisibility > 0,
	).length;

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b">
						<th className="text-center py-3 px-2 font-semibold">Prompts With Mentions</th>
						<th className="text-center py-3 px-2 font-semibold">Total Prompts Tracked</th>
						<th className="text-center py-3 px-2 font-semibold">Opportunity</th>
						<th className="text-left py-3 px-2 font-semibold">Recommendation</th>
					</tr>
				</thead>
				<tbody>
					<tr className="border-b border-gray-100">
						<td className="text-center py-3 px-2">
							<span className="text-sm font-semibold text-gray-700">
								{(promptsWithBrandMentions * 15).toLocaleString()}
							</span>
						</td>
						<td className="text-center py-3 px-2">
							<span className="text-sm text-gray-700">
								{(totalPromptsTracked * 15).toLocaleString()}
							</span>
						</td>
						<td className="text-center py-3 px-2">
							<Badge className="text-xs">High</Badge>
						</td>
						<td className="py-3 px-2 text-sm text-gray-700">
							Generate content to increase brand visibility
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}

function OptimizationTable({
	itemsWithVisibility,
	mockPromptRuns,
	competitors,
}: {
	itemsWithVisibility: DisplayItem[];
	mockPromptRuns: MockPromptRun[];
	competitors: CompetitorResult[];
}) {
	const topPromptsSubset = itemsWithVisibility.slice(0, 20);

	const competitiveAnalysis = topPromptsSubset
		.map((item) => {
			const prompt = item.data;
			const runs = mockPromptRuns.filter((run) => run.promptId === prompt.id);
			if (runs.length === 0) return null;

			const brandVisibility = item.brandVisibility;

			const competitorVisibilities: number[] = [];
			for (const competitor of competitors) {
				const competitorMentions = runs.filter(
					(run) =>
						run.competitorsMentioned && run.competitorsMentioned.includes(competitor.name),
				).length;
				competitorVisibilities.push(Math.round((competitorMentions / runs.length) * 100));
			}

			const higherCompetitorVisibilities = competitorVisibilities.filter(
				(vis) => vis > brandVisibility,
			);
			if (higherCompetitorVisibilities.length === 0) return null;

			const avgCompetitorVisibility = Math.round(
				higherCompetitorVisibilities.reduce((sum, vis) => sum + vis, 0) /
					higherCompetitorVisibilities.length,
			);
			const visibilityGap = avgCompetitorVisibility - brandVisibility;

			const goalIncrease = Math.floor(Math.random() * 11) + 5;
			const goalVisibility = Math.min(100, avgCompetitorVisibility + goalIncrease);

			return {
				prompt: prompt.value,
				brandVisibility,
				avgCompetitorVisibility,
				goalVisibility,
				visibilityGap,
			};
		})
		.filter(Boolean) as Array<{
		prompt: string;
		brandVisibility: number;
		avgCompetitorVisibility: number;
		goalVisibility: number;
		visibilityGap: number;
	}>;

	const topOpportunities = competitiveAnalysis
		.sort((a, b) => {
			if (a.brandVisibility > 0 && b.brandVisibility === 0) return -1;
			if (a.brandVisibility === 0 && b.brandVisibility > 0) return 1;
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
						<th className="text-left py-3 px-2 font-semibold">Recommendation</th>
					</tr>
				</thead>
				<tbody>
					{topOpportunities.map((opportunity) => (
						<tr key={opportunity.prompt} className="border-b border-gray-100">
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
							<td className="py-3 px-2 text-xs text-gray-700">
								Write{" "}
								{Math.max(
									1,
									Math.round(
										Math.sqrt(
											opportunity.goalVisibility - opportunity.brandVisibility,
										),
									),
								)}{" "}
								LLM-friendly articles on "{opportunity.prompt}"
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
