/**
 * /reports/render/$reportId - Standalone report rendering page
 *
 * Displays a completed report with Share of Voice metrics, charts, and analysis.
 * Designed as production-quality printable marketing material.
 */
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { requireAuthSession, hasReportAccess } from "@/lib/auth/helpers";
import { getReportByIdFn } from "@/server/reports";
import { PromptChartPrint } from "@/components/prompt-chart-print";
import { Logo } from "@/components/logo";
import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import {
	computeOverallSoV,
	computePromptSoV,
	computeCompetitorSoVs,
	selectRepresentativePrompts,
	getSoVColor,
	getSoVBadgeClasses,
	getSoVLevel,
	type ReportPromptRun,
	type PromptSoV,
	type PromptCategory,
	type CompetitorSoV,
} from "@workspace/lib/report-metrics";

// ---------- Types ----------

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

// ---------- Helpers ----------

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
			{ title: "AI Share of Voice Report" },
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
				<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
					<p className="text-gray-500 text-lg">
						Report is not completed yet. Status: <span className="font-medium">{report.status}</span>
					</p>
				</div>
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

	// Create prompt runs
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

	// Compute SoV metrics using shared module
	const reportRuns: ReportPromptRun[] = mockPromptRuns.map((r) => ({
		promptId: r.promptId,
		brandMentioned: r.brandMentioned,
		competitorsMentioned: r.competitorsMentioned,
	}));

	const overallSoV = computeOverallSoV(reportRuns, parsedReportData.competitors);
	const competitorSoVs = computeCompetitorSoVs(reportRuns, parsedReportData.competitors);

	// Compute per-prompt SoV
	const promptSoVs: PromptSoV[] = mockPrompts.map((prompt) =>
		computePromptSoV(prompt.id, reportRuns, parsedReportData.competitors),
	);

	// Build prompt lookup
	const promptMap = new Map(mockPrompts.map((p) => [p.id, p]));
	const promptSoVMap = new Map(promptSoVs.map((s) => [s.promptId, s]));

	// Select representative prompts (2 strengths + 2 opportunities)
	const selectedPrompts = selectRepresentativePrompts(
		promptSoVs,
		(id: string) => {
			const prompt = promptMap.get(id);
			return prompt ? isPromptBranded(prompt.value, report.brandName, report.brandWebsite) : false;
		},
	);

	const sovLevel = getSoVLevel(overallSoV);
	const sovColor = getSoVColor(overallSoV);

	// Summary stats
	const totalPrompts = mockPrompts.length;
	const promptsWithMentions = promptSoVs.filter((p) => p.brandMentionCount > 0).length;

	return (
		<div className="max-w-[816px] mx-auto bg-white print:shadow-none">
			{/* ===== PAGE 1: Cover ===== */}
			<div className="p-12 print:p-10 min-h-screen flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between mb-16 print:mb-10">
					<Logo iconClassName="!size-5" textClassName="text-sm font-semibold text-gray-400" />
					<span className="text-xs text-gray-400 tracking-wide uppercase">Confidential</span>
				</div>

				{/* Hero Section */}
				<div className="flex-1 flex flex-col justify-center">
					<div className="mb-2">
						<span className="text-xs font-semibold tracking-widest uppercase text-gray-400">
							AI Share of Voice Report
						</span>
					</div>
					<h1 className="text-5xl font-bold text-gray-900 tracking-tight mb-6 print:text-4xl">
						{report.brandName}
					</h1>
					<div className="w-16 h-1 bg-gray-900 mb-8" />

					{/* Key Metric */}
					<div className="flex items-baseline gap-4 mb-10">
						<span className={`text-7xl font-bold tracking-tight ${sovColor} print:text-6xl`}>
							{overallSoV !== null ? `${overallSoV}%` : "N/A"}
						</span>
						<div className="flex flex-col">
							<span className="text-lg font-semibold text-gray-900">Share of Voice</span>
							<span className="text-sm text-gray-500">{sovLevel.label} &mdash; {sovLevel.description}</span>
						</div>
					</div>

					{/* Quick Stats Row */}
					<div className="grid grid-cols-3 gap-6">
						<div className="border-t-2 border-gray-900 pt-4">
							<div className="text-2xl font-bold text-gray-900">{totalPrompts}</div>
							<div className="text-xs text-gray-500 mt-1">Prompts Tested</div>
						</div>
						<div className="border-t-2 border-gray-900 pt-4">
							<div className="text-2xl font-bold text-gray-900">{promptsWithMentions}</div>
							<div className="text-xs text-gray-500 mt-1">With Brand Mentions</div>
						</div>
						<div className="border-t-2 border-gray-900 pt-4">
							<div className="text-2xl font-bold text-gray-900">{parsedReportData.competitors.length}</div>
							<div className="text-xs text-gray-500 mt-1">Competitors Tracked</div>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="mt-auto pt-8 border-t border-gray-100 flex justify-between items-center">
					<span className="text-xs text-gray-400">
						Generated {new Date(report.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
					</span>
					<span className="text-xs text-gray-400">{branding?.url || "elmo.chat"}</span>
				</div>
			</div>

			{/* ===== PAGE 2: What is Share of Voice + Competitive Landscape ===== */}
			<div className="p-12 print:p-10 print:break-before-page min-h-screen flex flex-col">
				<SectionHeader number="01" title="Understanding Share of Voice" />

				<div className="mb-8">
					<p className="text-gray-600 text-sm leading-relaxed mb-4">
						<strong className="text-gray-900">Share of Voice (SoV)</strong> measures your brand's
						presence relative to competitors in AI-generated responses. When users ask questions,
						AI engines like ChatGPT, Claude, Perplexity, and Google's AI Overviews synthesize
						information and recommend brands. SoV tells you what percentage of those recommendations
						belong to you.
					</p>
					<p className="text-gray-600 text-sm leading-relaxed">
						Unlike raw mention counts, SoV normalizes for prompt difficulty and volume. A 40% SoV
						means that for every 10 brand recommendations AI makes in your category, 4 are for you.
					</p>
				</div>

				{/* SoV Scale */}
				<div className="mb-10">
					<div className="flex gap-0 rounded-lg overflow-hidden h-3 mb-3">
						<div className="flex-1 bg-rose-400" />
						<div className="flex-1 bg-amber-400" />
						<div className="flex-1 bg-emerald-500" />
					</div>
					<div className="flex text-xs text-gray-500">
						<div className="flex-1">
							<span className="font-semibold text-rose-600">0-19%</span> Low
						</div>
						<div className="flex-1 text-center">
							<span className="font-semibold text-amber-600">20-39%</span> Moderate
						</div>
						<div className="flex-1 text-right">
							<span className="font-semibold text-emerald-600">40%+</span> Strong
						</div>
					</div>
				</div>

				{/* Competitive Landscape */}
				<SectionHeader number="02" title="Competitive Landscape" />

				<div className="mb-4">
					<p className="text-gray-600 text-sm leading-relaxed mb-6">
						How your brand's AI share of voice compares to the competition across {totalPrompts} prompts
						tested against ChatGPT, Claude, and Google AI.
					</p>
				</div>

				{/* SoV Comparison Table */}
				<div className="rounded-xl border border-gray-200 overflow-hidden mb-6">
					<table className="w-full text-sm">
						<thead>
							<tr className="bg-gray-50">
								<th className="text-left py-3 px-5 font-semibold text-gray-600 text-xs tracking-wide uppercase">Brand</th>
								<th className="text-right py-3 px-5 font-semibold text-gray-600 text-xs tracking-wide uppercase">Share of Voice</th>
								<th className="py-3 px-5 font-semibold text-gray-600 text-xs tracking-wide uppercase w-1/2">Distribution</th>
							</tr>
						</thead>
						<tbody>
							{/* Brand row */}
							<tr className="border-t border-gray-100 bg-blue-50/30">
								<td className="py-3 px-5">
									<span className="font-semibold text-gray-900">{report.brandName}</span>
								</td>
								<td className="py-3 px-5 text-right">
									<span className={`font-bold text-lg ${sovColor}`}>
										{overallSoV !== null ? `${overallSoV}%` : "N/A"}
									</span>
								</td>
								<td className="py-3 px-5">
									<SoVBar value={overallSoV} color="bg-blue-500" />
								</td>
							</tr>
							{/* Competitor rows */}
							{competitorSoVs.map((comp) => (
								<tr key={comp.name} className="border-t border-gray-100">
									<td className="py-3 px-5">
										<span className="text-gray-700">{comp.name}</span>
									</td>
									<td className="py-3 px-5 text-right">
										<span className="font-semibold text-gray-700">{comp.sov}%</span>
									</td>
									<td className="py-3 px-5">
										<SoVBar value={comp.sov} color="bg-gray-400" />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="mt-auto pt-6 border-t border-gray-100">
					<PageFooter branding={branding} />
				</div>
			</div>

			{/* ===== PAGE 3: Prompt Analysis Charts ===== */}
			{selectedPrompts.length > 0 && (
				<div className="p-12 print:p-10 print:break-before-page min-h-screen flex flex-col">
					<SectionHeader number="03" title="Prompt Analysis" />
					<p className="text-gray-600 text-sm leading-relaxed mb-8">
						A representative sample of prompts showing where {report.brandName} is
						performing well and where opportunities exist.
					</p>

					<div className="space-y-6 flex-1">
						{selectedPrompts.map((selected) => {
							const prompt = promptMap.get(selected.promptId);
							const sov = promptSoVMap.get(selected.promptId);
							if (!prompt) return null;

							return (
								<div key={selected.promptId} className="print:break-inside-avoid">
									<div className="flex items-center gap-2 mb-2">
										<CategoryBadge category={selected.category} />
										{selected.sov !== null && (
											<span className={`text-xs font-semibold ${getSoVColor(selected.sov)}`}>
												{selected.sov}% SoV
											</span>
										)}
									</div>
									<PromptChartPrint
										lookback="1m"
										promptName={prompt.value}
										promptId={prompt.id}
										brand={mockBrand as any}
										competitors={mockCompetitors as any}
										promptRuns={fullPromptRuns}
										category={selected.category}
									/>
								</div>
							);
						})}
					</div>

					<div className="mt-auto pt-6 border-t border-gray-100">
						<PageFooter branding={branding} />
					</div>
				</div>
			)}

			{/* ===== PAGE 4: Opportunities + CTA ===== */}
			<div className="p-12 print:p-10 print:break-before-page min-h-screen flex flex-col">
				<SectionHeader number="04" title="Growth Opportunities" />
				<p className="text-gray-600 text-sm leading-relaxed mb-8">
					Prompts where competitors are outperforming {report.brandName} represent your biggest
					opportunities to increase AI share of voice.
				</p>

				<OpportunitiesTable
					promptSoVs={promptSoVs}
					promptMap={promptMap}
					mockPromptRuns={reportRuns}
					competitors={parsedReportData.competitors}
					brandName={report.brandName}
				/>

				{/* Summary Stats */}
				<div className="mt-10 rounded-xl bg-gray-50 p-6">
					<h3 className="text-sm font-semibold text-gray-900 mb-4">Report Summary</h3>
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<span className="text-gray-500">Total prompts tested</span>
							<span className="float-right font-semibold text-gray-900">{totalPrompts}</span>
						</div>
						<div>
							<span className="text-gray-500">Prompts with brand mentions</span>
							<span className="float-right font-semibold text-gray-900">{promptsWithMentions}</span>
						</div>
						<div>
							<span className="text-gray-500">AI engines tested</span>
							<span className="float-right font-semibold text-gray-900">ChatGPT, Claude, Google AI</span>
						</div>
						<div>
							<span className="text-gray-500">Competitors tracked</span>
							<span className="float-right font-semibold text-gray-900">{parsedReportData.competitors.length}</span>
						</div>
					</div>
				</div>

				{/* CTA */}
				<div className="mt-auto pt-10">
					<div className="rounded-xl bg-gradient-to-br from-gray-900 to-gray-800 p-8 text-white">
						<h2 className="text-xl font-bold mb-2">
							Ready to grow your AI share of voice?
						</h2>
						<p className="text-gray-300 text-sm mb-6 leading-relaxed">
							{branding?.name || "Elmo"} continuously monitors your brand across AI engines
							and provides actionable strategies to increase your share of voice.
						</p>
						<div className="grid grid-cols-3 gap-6 text-center">
							<div>
								<div className="text-2xl font-bold mb-1">24/7</div>
								<div className="text-xs text-gray-400">AI Monitoring</div>
							</div>
							<div>
								<div className="text-2xl font-bold mb-1">3+</div>
								<div className="text-xs text-gray-400">AI Engines</div>
							</div>
							<div>
								<div className="text-2xl font-bold mb-1">Real-time</div>
								<div className="text-xs text-gray-400">Competitive Intel</div>
							</div>
						</div>
						<div className="mt-6 pt-4 border-t border-gray-700 text-center">
							<span className="text-sm text-gray-300">
								Learn more at <strong className="text-white">{branding?.url || "elmo.chat"}</strong>
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// ---------- Sub-components ----------

function SectionHeader({ number, title }: { number: string; title: string }) {
	return (
		<div className="flex items-baseline gap-3 mb-6">
			<span className="text-xs font-bold text-gray-300 tracking-wider">{number}</span>
			<h2 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h2>
		</div>
	);
}

function SoVBar({ value, color }: { value: number | null; color: string }) {
	const width = value !== null ? Math.max(2, value) : 0;
	return (
		<div className="w-full bg-gray-100 rounded-full h-2.5">
			<div
				className={`${color} h-2.5 rounded-full transition-all`}
				style={{ width: `${width}%` }}
			/>
		</div>
	);
}

function CategoryBadge({ category }: { category: PromptCategory }) {
	if (category === "strength") {
		return (
			<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
				Strength
			</span>
		);
	}
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
			Opportunity
		</span>
	);
}

function PageFooter({ branding }: { branding?: ClientConfig["branding"] }) {
	return (
		<div className="flex justify-between items-center text-xs text-gray-400">
			<Logo iconClassName="!size-4" textClassName="text-xs font-medium text-gray-400" />
			<span>{branding?.url || "elmo.chat"}</span>
		</div>
	);
}

function OpportunitiesTable({
	promptSoVs,
	promptMap,
	mockPromptRuns,
	competitors,
	brandName,
}: {
	promptSoVs: PromptSoV[];
	promptMap: Map<string, MockPrompt>;
	mockPromptRuns: ReportPromptRun[];
	competitors: CompetitorResult[];
	brandName: string;
}) {
	// Find prompts where competitors outperform the brand
	const opportunities = promptSoVs
		.map((promptSoV) => {
			const prompt = promptMap.get(promptSoV.promptId);
			if (!prompt) return null;

			const brandSoV = promptSoV.sov ?? 0;

			// Find the highest competitor SoV for this prompt
			const promptRuns = mockPromptRuns.filter((r) => r.promptId === promptSoV.promptId);
			let bestCompetitorName = "";
			let bestCompetitorMentions = 0;

			for (const comp of competitors) {
				const mentions = promptRuns.filter(
					(r) => r.competitorsMentioned?.includes(comp.name),
				).length;
				if (mentions > bestCompetitorMentions) {
					bestCompetitorMentions = mentions;
					bestCompetitorName = comp.name;
				}
			}

			if (bestCompetitorMentions === 0) return null;

			const totalMentions = promptSoV.brandMentionCount + promptSoV.totalCompetitorMentions;
			const competitorSoV = totalMentions > 0
				? Math.round((bestCompetitorMentions / totalMentions) * 100)
				: 0;

			const gap = competitorSoV - brandSoV;
			if (gap <= 0) return null;

			return {
				prompt: prompt.value,
				brandSoV,
				competitorName: bestCompetitorName,
				competitorSoV,
				gap,
			};
		})
		.filter(Boolean)
		.sort((a, b) => b!.gap - a!.gap)
		.slice(0, 5) as Array<{
			prompt: string;
			brandSoV: number;
			competitorName: string;
			competitorSoV: number;
			gap: number;
		}>;

	if (opportunities.length === 0) {
		return (
			<div className="rounded-xl border border-gray-200 p-8 text-center">
				<p className="text-gray-500 text-sm">
					{brandName} is performing well across all tracked prompts. No significant competitive gaps found.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-gray-200 overflow-hidden">
			<table className="w-full text-sm">
				<thead>
					<tr className="bg-gray-50">
						<th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs tracking-wide uppercase">Prompt</th>
						<th className="text-center py-3 px-4 font-semibold text-gray-600 text-xs tracking-wide uppercase whitespace-nowrap">Your SoV</th>
						<th className="text-center py-3 px-4 font-semibold text-gray-600 text-xs tracking-wide uppercase whitespace-nowrap">Top Competitor</th>
						<th className="text-center py-3 px-4 font-semibold text-gray-600 text-xs tracking-wide uppercase">Gap</th>
					</tr>
				</thead>
				<tbody>
					{opportunities.map((opp) => (
						<tr key={opp.prompt} className="border-t border-gray-100">
							<td className="py-3 px-4 max-w-[280px]">
								<div className="text-xs text-gray-700 break-words leading-relaxed">
									{opp.prompt}
								</div>
							</td>
							<td className="text-center py-3 px-4">
								<span className={`text-xs font-semibold ${getSoVColor(opp.brandSoV)}`}>
									{opp.brandSoV}%
								</span>
							</td>
							<td className="text-center py-3 px-4">
								<div className="text-xs text-gray-700">
									<span className="font-semibold">{opp.competitorSoV}%</span>
									<span className="text-gray-400 block text-[10px]">{opp.competitorName}</span>
								</div>
							</td>
							<td className="text-center py-3 px-4">
								<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-600">
									-{opp.gap}%
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
