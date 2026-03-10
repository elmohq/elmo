import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import {
	getPromptCitationUrlStats,
	getPromptMentionSummary,
	getPromptTopCompetitorMentions,
} from "@/lib/postgres-read";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";

function isValidUUID(id: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(id);
}

function isValidDate(dateStr: string): boolean {
	const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
	if (!dateRegex.test(dateStr)) return false;
	const d = new Date(`${dateStr}T00:00:00Z`);
	return !Number.isNaN(d.getTime());
}

function extractDomain(urlOrDomain: string): string {
	try {
		const cleaned = urlOrDomain.replace(/^https?:\/\//, "");
		const withoutWww = cleaned.replace(/^www\./, "");
		const domain = withoutWww.split("/")[0];
		return domain.toLowerCase();
	} catch {
		return urlOrDomain.toLowerCase();
	}
}

function normalizeUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		if (urlObj.searchParams.get("utm_source") === "openai") {
			urlObj.searchParams.delete("utm_source");
		}
		urlObj.search = urlObj.searchParams.toString();
		return urlObj.toString();
	} catch {
		return url;
	}
}

function getPromptIdFromPath(request: Request): string {
	const segments = new URL(request.url).pathname.split("/").filter(Boolean);
	const snapshotIndex = segments.lastIndexOf("snapshot");
	return snapshotIndex > 0 ? decodeURIComponent(segments[snapshotIndex - 1]) : "";
}

export const Route = createFileRoute("/api/v1/prompts/$promptId/snapshot")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const promptId = getPromptIdFromPath(request);
					const { searchParams } = new URL(request.url);

					if (!isValidUUID(promptId)) {
						return Response.json({ error: "Validation Error", message: "Invalid prompt ID format" }, { status: 400 });
					}

					const startDate = searchParams.get("startDate");
					const endDate = searchParams.get("endDate");
					if (!startDate || !endDate) {
						return Response.json(
							{
								error: "Validation Error",
								message: "startDate and endDate query parameters are required (YYYY-MM-DD format)",
							},
							{ status: 400 },
						);
					}
					if (!isValidDate(startDate) || !isValidDate(endDate)) {
						return Response.json(
							{
								error: "Validation Error",
								message: "startDate and endDate must be valid dates in YYYY-MM-DD format",
							},
							{ status: 400 },
						);
					}
					if (startDate > endDate) {
						return Response.json(
							{ error: "Validation Error", message: "startDate must be before or equal to endDate" },
							{ status: 400 },
						);
					}

					const kMentionsParam = Number.parseInt(searchParams.get("kMentions") || "5", 10);
					const kMentions = Number.isNaN(kMentionsParam) ? 5 : Math.max(1, Math.min(50, kMentionsParam));
					const kCitationsParam = Number.parseInt(searchParams.get("kCitations") || "10", 10);
					const kCitations = Number.isNaN(kCitationsParam) ? 10 : Math.max(1, Math.min(50, kCitationsParam));

					const promptResult = await db
						.select({ id: prompts.id, brandId: prompts.brandId, value: prompts.value })
						.from(prompts)
						.where(eq(prompts.id, promptId))
						.limit(1);
					if (promptResult.length === 0) {
						return Response.json({ error: "Not Found", message: `Prompt with ID '${promptId}' not found` }, { status: 404 });
					}
					const prompt = promptResult[0];

					const [brandInfo, competitorsList] = await Promise.all([
						db.select().from(brands).where(eq(brands.id, prompt.brandId)).limit(1),
						db.select().from(competitors).where(eq(competitors.brandId, prompt.brandId)),
					]);
					if (brandInfo.length === 0) {
						return Response.json({ error: "Internal Server Error", message: "Brand not found for prompt" }, { status: 500 });
					}
					const brandDomain = extractDomain(brandInfo[0].website);
					const competitorDomains = new Set(competitorsList.map((c) => extractDomain(c.domain)));

					const timezone = "UTC";
					const [mentionData, topCompetitors, citationUrlStats] = await Promise.all([
						getPromptMentionSummary(promptId, startDate, endDate, timezone),
						getPromptTopCompetitorMentions(promptId, startDate, endDate, timezone, kMentions),
						getPromptCitationUrlStats(promptId, startDate, endDate, timezone),
					]);

					const mentionsTopK = topCompetitors.map((row) => ({
						entity: row.competitor_name,
						count: Number(row.mention_count),
					}));

					const urlCounts = new Map<string, { count: number; title?: string; domain: string }>();
					for (const { url, domain, title, count } of citationUrlStats) {
						const normalizedUrl = normalizeUrl(url);
						const existing = urlCounts.get(normalizedUrl);
						if (existing) {
							existing.count += Number(count);
							if (!existing.title && title) existing.title = title;
						} else {
							urlCounts.set(normalizedUrl, { count: Number(count), title: title || undefined, domain });
						}
					}

					let brandCitationsTotal = 0;
					let competitorCitationsTotal = 0;
					let citationsTotal = 0;
					const allCitationUrls = Array.from(urlCounts.entries())
						.map(([url, { count, title, domain }]) => {
							citationsTotal += count;
							if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) {
								brandCitationsTotal += count;
							} else if (competitorDomains.has(domain)) {
								competitorCitationsTotal += count;
							}
							return { url, title, count };
						})
						.sort((a, b) => b.count - a.count);

					const citedUrlsTopK = allCitationUrls.slice(0, kCitations).map(({ url, title, count }) => ({
						url,
						title: title || null,
						count,
					}));

					return Response.json({
						brandId: prompt.brandId,
						promptId: prompt.id,
						promptValue: prompt.value,
						startDate,
						endDate,
					mentions: {
						mentionsTotal:
							Number(mentionData.brand_mentioned_count) + Number(mentionData.competitor_mentioned_count),
						brandMentionsTotal: Number(mentionData.brand_mentioned_count),
						competitorMentionsTotal: Number(mentionData.competitor_mentioned_count),
						mentionsTopK,
					},
						citations: {
							citationsTotal,
							brandCitationsTotal,
							competitorCitationsTotal,
							citedUrlsTopK,
						},
					});
				} catch (error) {
					console.error("Error fetching prompt snapshot:", error);
					return Response.json(
						{ error: "Internal Server Error", message: "Failed to fetch prompt snapshot" },
						{ status: 500 },
					);
				}
			},
		},
	},
});
