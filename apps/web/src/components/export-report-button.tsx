import { IconDownload, IconFileSpreadsheet, IconMarkdown } from "@tabler/icons-react";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { useState } from "react";
import { type I18n, useI18n } from "@/lib/i18n";
import { CATEGORY_CONFIG } from "@/lib/domain-categories";
import { labelForModelFilter } from "@/lib/model-filter";
import { downloadFile, type Report, reportToMarkdown, reportToXlsx } from "@/lib/report-export";
import { getCitationsFn } from "@/server/citations";
import { getReportDataFn, type ReportDataResponse, type ReportPrompt } from "@/server/report-data";
import type { ShareOfVoiceResponse } from "@/server/analysis";
import type { DashboardSummaryResponse } from "@/server/dashboard";

const TOP_CITATIONS = 25;
const LOOKBACK_DAYS = 30;

const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);

function lastNumber(values: (number | null)[]): number | null {
	for (let i = values.length - 1; i >= 0; i--) {
		const v = values[i];
		if (typeof v === "number") return v;
	}
	return null;
}

function buildReport(
	{ t, p, dt }: I18n,
	brandName: string,
	summary: DashboardSummaryResponse,
	sov: ShareOfVoiceResponse | undefined,
	citations: Awaited<ReturnType<typeof getCitationsFn>>,
	details: ReportDataResponse,
): Report {
	const sovByDate = new Map((sov?.shareTimeSeries ?? []).map((point) => [point.date, point.share]));
	const currentVisibility = lastNumber(summary.visibilityTimeSeries.map((point) => point.overall));
	const currentSov = lastNumber((sov?.shareTimeSeries ?? []).map((point) => point.share));
	const percent = (value: number | null) => (value === null ? "—" : p(value, { maximumFractionDigits: 1 }));
	const modelLabel = (model: string) => t(labelForModelFilter(model));
	const date = (value: string | null) => (value ? dt(value) : null);
	const promptType = (branded: boolean) => (branded ? t("Branded") : t("Non-branded"));

	const rankedModels = details.models
		.map((model) => ({ model, visibility: details.byModel[model]?.visibility ?? null }))
		.filter((m): m is { model: string; visibility: number } => m.visibility !== null)
		.sort((a, b) => b.visibility - a.visibility);
	const best = rankedModels[0];
	const worst = rankedModels.length > 1 ? rankedModels[rankedModels.length - 1] : undefined;

	// Biggest gap to the leading competitor first — the prompts most worth working on.
	const gap = (prompt: ReportPrompt) => (prompt.topCompetitorRate ?? 0) - (prompt.visibility ?? 0);
	const prompts = [...details.prompts].sort((a, b) => gap(b) - gap(a));

	return {
		title: t("AI visibility report — {brand}", { brand: brandName }),
		meta: [
			[t("Brand"), brandName],
			[t("Period"), t("Last 30 days")],
			[t("Generated on"), dt(new Date())],
			[t("Prompts tracked"), String(summary.totalPrompts)],
			[t("Evaluations (30d)"), String(summary.totalRuns)],
			[t("Current AI visibility"), percent(currentVisibility)],
			[t("Branded prompts visibility"), percent(summary.brandedVisibility)],
			[t("Non-branded prompts visibility"), percent(summary.nonBrandedVisibility)],
			[t("Current share of voice"), percent(currentSov)],
			[t("Total citations"), String(citations.totalCitations)],
			...(best ? [[t("Best platform"), `${modelLabel(best.model)} (${percent(best.visibility)})`] as [string, string]] : []),
			...(worst
				? [[t("Weakest platform"), `${modelLabel(worst.model)} (${percent(worst.visibility)})`] as [string, string]]
				: []),
		],
		tables: [
			{
				title: t("By AI platform"),
				headers: [
					t("AI platform"),
					t("Answers"),
					t("Answers naming the brand"),
					t("Visibility (%)"),
					t("Share of voice (%)"),
					t("Most-named competitor"),
					t("Competitor rate (%)"),
					t("Citations"),
					t("Citations of your site"),
					t("Most-cited domains"),
				],
				rows: details.models.map((model) => {
					const s = details.byModel[model]!;
					return [
						modelLabel(model),
						s.runs,
						s.brandMentions,
						s.visibility,
						s.shareOfVoice,
						s.topCompetitor,
						s.topCompetitorRate,
						s.citations,
						s.ownSiteCitations,
						s.topDomains.join(", ") || null,
					];
				}),
			},
			{
				title: t("Prompts"),
				headers: [
					t("Prompt"),
					t("Tags"),
					t("Type"),
					t("Answers"),
					t("Visibility (%)"),
					...details.models.map((model) => `${modelLabel(model)} (%)`),
					t("Leading competitor"),
					t("Competitor rate (%)"),
					t("Gap (pts)"),
					t("Citations"),
					t("Citations of your site"),
					t("Most-cited domains"),
					t("Last evaluated"),
				],
				rows: prompts.map((prompt) => [
					prompt.value,
					prompt.tags.join(", ") || null,
					promptType(prompt.branded),
					prompt.runs,
					prompt.visibility,
					...details.models.map((model) => prompt.byModel[model]?.visibility ?? null),
					prompt.topCompetitor,
					prompt.topCompetitorRate,
					prompt.visibility === null ? null : round(gap(prompt)),
					prompt.citations,
					prompt.ownSiteCitations,
					prompt.topDomains.join(", ") || null,
					date(prompt.lastRunAt),
				]),
			},
			{
				title: t("Prompts by AI platform"),
				headers: [
					t("Prompt"),
					t("AI platform"),
					t("Answers"),
					t("Visibility (%)"),
					t("Share of voice (%)"),
					t("Leading competitor"),
					t("Competitor rate (%)"),
					t("Citations"),
					t("Citations of your site"),
					t("Most-cited domains"),
				],
				rows: prompts.flatMap((prompt) =>
					details.models
						.filter((model) => prompt.byModel[model])
						.map((model) => {
							const s = prompt.byModel[model]!;
							return [
								prompt.value,
								modelLabel(model),
								s.runs,
								s.visibility,
								s.shareOfVoice,
								s.topCompetitor,
								s.topCompetitorRate,
								s.citations,
								s.ownSiteCitations,
								s.topDomains.join(", ") || null,
							];
						}),
				),
			},
			{
				title: t("Competitors by prompt"),
				headers: [t("Prompt"), t("Competitor"), t("Mentions"), t("Rate (%)")],
				rows: prompts.flatMap((prompt) =>
					prompt.competitors.map((c) => [prompt.value, c.name, c.mentions, c.rate]),
				),
			},
			{
				title: t("Daily trends"),
				headers: [t("Date"), t("AI visibility (%)"), t("Branded (%)"), t("Non-branded (%)"), t("Share of voice (%)")],
				rows: summary.visibilityTimeSeries.map((point) => [
					point.date,
					round(point.overall),
					round(point.branded),
					round(point.nonBranded),
					round(sovByDate.get(point.date) ?? null),
				]),
			},
			{
				title: t("Share of Voice"),
				headers: [t("Name"), t("Mentions"), t("Share (%)"), t("Prompts")],
				rows: (sov?.entries ?? []).map((entry) => [
					entry.isBrand ? `${entry.name} (${t("Brand")})` : entry.name,
					entry.mentions,
					round(entry.share),
					entry.prompts,
				]),
			},
			{
				title: t("Top cited domains"),
				headers: [t("Domain"), t("Category"), t("Citations")],
				rows: citations.domainDistribution
					.slice(0, TOP_CITATIONS)
					.map((domain) => [domain.domain, t(CATEGORY_CONFIG[domain.category].label), domain.count]),
			},
			{
				title: t("Top cited pages"),
				headers: [t("URL"), t("Page title"), t("Category"), t("Citations")],
				rows: citations.specificUrls
					.slice(0, TOP_CITATIONS)
					.map((url) => [url.url, url.title ?? null, t(CATEGORY_CONFIG[url.category].label), url.count]),
			},
			{
				title: t("Definitions"),
				headers: [t("Metric"), t("Meaning")],
				rows: [
					[
						t("Visibility (%)"),
						t("Share of AI answers that name the brand. Plain 30-day average, unlike the smoothed trend line."),
					],
					[t("Share of voice (%)"), t("Brand mentions divided by all brand and competitor mentions.")],
					[t("Competitor rate (%)"), t("Share of AI answers that name that competitor.")],
					[t("Gap (pts)"), t("Leading competitor rate minus brand visibility. Positive means the competitor is ahead.")],
					[t("Citations of your site"), t("Sources in the answers that link to the brand's own domains.")],
				],
			},
		],
	};
}

export function ExportReportButton({
	brandId,
	brandName,
	summary,
	sov,
}: {
	brandId: string;
	brandName: string;
	summary: DashboardSummaryResponse | undefined;
	sov: ShareOfVoiceResponse | undefined;
}) {
	const i18n = useI18n();
	const [isExporting, setIsExporting] = useState(false);

	const handleExport = async (format: "xlsx" | "md") => {
		if (!summary || isExporting) return;
		setIsExporting(true);
		try {
			const [citations, details] = await Promise.all([
				getCitationsFn({ data: { brandId, days: LOOKBACK_DAYS } }),
				getReportDataFn({ data: { brandId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }),
			]);
			const report = buildReport(i18n, brandName, summary, sov, citations, details);
			const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
			const fileName = `elmo-${slug}-${new Date().toISOString().slice(0, 10)}`;
			if (format === "xlsx") {
				downloadFile(
					`${fileName}.xlsx`,
					reportToXlsx(report),
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				);
			} else {
				downloadFile(`${fileName}.md`, reportToMarkdown(report), "text/markdown;charset=utf-8");
			}
		} catch (error) {
			console.error("Error exporting report:", error);
			window.alert(i18n.t("Couldn't export the report. Please try again."));
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline" size="sm" className="h-8" disabled={!summary || isExporting}>
						<IconDownload className="h-4 w-4" />
						{isExporting ? i18n.t("Exporting…") : i18n.t("Export report")}
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem className="cursor-pointer" onClick={() => handleExport("xlsx")}>
					<IconFileSpreadsheet />
					Excel (.xlsx)
				</DropdownMenuItem>
				<DropdownMenuItem className="cursor-pointer" onClick={() => handleExport("md")}>
					<IconMarkdown />
					Markdown (.md)
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
