/**
 * Stories for the experimental "Citation landscape" section (CitationInsightsView).
 * Builds fixtures through the real pure utils so the shapes stay correct.
 */
import type { Meta } from "@storybook/react";
import {
	computeDrQuadrants,
	computeKingmakers,
	computePromptDomainDistribution,
	computeScoreboard,
	computeWinnability,
	type DomainKind,
	type LandscapeDomain,
	summarizeDrBySourceType,
} from "@workspace/lib/citation-landscape";
import { summarizeSourceTypes } from "@workspace/lib/source-type";
import { CitationInsightsView, type CitationInsightsData } from "@/components/citation-insights";
import type { CitationCategory } from "@/lib/domain-categories";

const BRAND = ["acme.com"];
const COMPETITORS = [
	{ name: "Rival", domains: ["rival.com"] },
	{ name: "Trello", domains: ["trello.com"] },
];

const RATINGS: Record<string, number | null> = {
	"acme.com": 45,
	"rival.com": 78,
	"trello.com": 91,
	"reddit.com": 91,
	"g2.com": 89,
	"capterra.com": 84,
	"en.wikipedia.org": 93,
	"youtube.com": 100,
	"techcrunch.com": 93,
	"blog.workmgmt.com": 22,
	"nichetool.io": 12,
};

const KIND: Record<string, DomainKind> = {
	"acme.com": "own",
	"rival.com": "competitor",
	"trello.com": "competitor",
};
const kindOf = (d: string): DomainKind => KIND[d] ?? "third_party";
const catOf = (d: string): CitationCategory => {
	const k = kindOf(d);
	return k === "own" ? "brand" : k === "competitor" ? "competitor" : "other";
};

const PROMPTS = [
	{ id: "p1", value: "best project management software" },
	{ id: "p2", value: "asana alternatives" },
	{ id: "p3", value: "how to track team tasks" },
	{ id: "p4", value: "trello vs asana" },
	{ id: "p5", value: "free kanban tools" },
	{ id: "p6", value: "acme reviews" },
];

// (prompt, model, domain, count)
const E: [string, string, string, number][] = [
	["p1", "chatgpt", "g2.com", 4],
	["p1", "chatgpt", "capterra.com", 3],
	["p1", "chatgpt", "blog.workmgmt.com", 3],
	["p1", "perplexity", "reddit.com", 2],
	["p1", "perplexity", "rival.com", 2],
	["p2", "chatgpt", "reddit.com", 3],
	["p2", "chatgpt", "nichetool.io", 2],
	["p2", "perplexity", "blog.workmgmt.com", 2],
	["p2", "perplexity", "g2.com", 1],
	["p3", "chatgpt", "youtube.com", 3],
	["p3", "chatgpt", "acme.com", 2],
	["p3", "perplexity", "reddit.com", 2],
	["p4", "chatgpt", "trello.com", 5],
	["p4", "chatgpt", "techcrunch.com", 1],
	["p4", "perplexity", "en.wikipedia.org", 2],
	["p5", "chatgpt", "reddit.com", 2],
	["p5", "chatgpt", "capterra.com", 2],
	["p5", "perplexity", "nichetool.io", 1],
	["p6", "chatgpt", "acme.com", 4],
	["p6", "chatgpt", "g2.com", 2],
];

const URLS: { domain: string; url: string; title: string; count: number }[] = [
	{ domain: "blog.workmgmt.com", url: "https://blog.workmgmt.com/best-pm-tools", title: "10 Best PM Tools (2024)", count: 5 },
	{ domain: "g2.com", url: "https://g2.com/categories/project-management", title: "Best Project Management Software", count: 7 },
	{ domain: "capterra.com", url: "https://capterra.com/project-management-software", title: "Project Management Software", count: 5 },
	{ domain: "reddit.com", url: "https://reddit.com/r/productivity/comments/x", title: "What PM tool do you use?", count: 9 },
	{ domain: "en.wikipedia.org", url: "https://en.wikipedia.org/wiki/Project_management", title: "Project management", count: 2 },
	{ domain: "youtube.com", url: "https://youtube.com/watch?v=abc", title: "Task tracking tutorial", count: 3 },
	{ domain: "techcrunch.com", url: "https://techcrunch.com/2024/01/01/pm", title: "The PM tool wars", count: 1 },
	{ domain: "nichetool.io", url: "https://nichetool.io/post", title: "Our take on kanban", count: 3 },
	{ domain: "acme.com", url: "https://acme.com/features", title: "Acme features", count: 6 },
	{ domain: "trello.com", url: "https://trello.com/", title: "Trello", count: 5 },
	{ domain: "rival.com", url: "https://rival.com/", title: "Rival", count: 2 },
];

// Web-search run universe per prompt (denominator for volatility).
const RUNS_BY_PROMPT: Record<string, number> = { p1: 8, p2: 8, p3: 6, p4: 8, p5: 6, p6: 8 };

function buildData(): CitationInsightsData {
	const edges = E.map(([promptId, model, domain, count]) => ({ promptId, model, domain, count }));
	const brandCitedPromptIds = [...new Set(edges.filter((e) => kindOf(e.domain) === "own").map((e) => e.promptId))];

	const totals = new Map<string, number>();
	const modelsByDomain: Record<string, Set<string>> = {};
	for (const e of edges) {
		totals.set(e.domain, (totals.get(e.domain) ?? 0) + e.count);
		if (!modelsByDomain[e.domain]) modelsByDomain[e.domain] = new Set();
		modelsByDomain[e.domain].add(e.model);
	}
	const allDomains = [...totals.keys()];

	// Fabricate run-level stats from per-(prompt, domain) totals for the demo.
	const ppd = new Map<string, number>();
	for (const e of edges) {
		const k = `${e.promptId}|${e.domain}`;
		ppd.set(k, (ppd.get(k) ?? 0) + e.count);
	}
	const runStats = [...ppd].map(([k, total]) => {
		const [promptId, domain] = k.split("|");
		const runs = RUNS_BY_PROMPT[promptId] ?? 8;
		const runsPresent = Math.max(1, Math.min(runs, Math.round(total / 2)));
		const perRun = total / runsPresent;
		return { promptId, domain, total, sumsq: Math.round(runsPresent * perRun * perRun), runsPresent };
	});
	const landscape: LandscapeDomain[] = allDomains.map((domain) => ({
		domain,
		count: totals.get(domain) ?? 0,
		rating: RATINGS[domain] ?? null,
		kind: kindOf(domain),
	}));

	return {
		pending: 0,
		totalDomains: allDomains.length,
		drQuadrants: computeDrQuadrants(landscape),
		sourceTypes: summarizeSourceTypes(
			URLS.map((u) => ({ ...u, isOwn: kindOf(u.domain) === "own", isCompetitor: kindOf(u.domain) === "competitor" })),
		),
		kingmakers: computeKingmakers({
			edges: edges.map((e) => ({ promptId: e.promptId, domain: e.domain, count: e.count })),
			kindOf: Object.fromEntries(allDomains.map((d) => [d, kindOf(d)])),
			brandCitedPromptIds,
			ratings: RATINGS,
			modelsByDomain: Object.fromEntries(Object.entries(modelsByDomain).map(([d, s]) => [d, [...s]])),
		}).map((k) => ({ ...k, examples: k.examplePromptIds.map((id) => PROMPTS.find((p) => p.id === id)?.value ?? id) })),
		winnability: computeWinnability({
			runStats: runStats.map((r) => ({ promptId: r.promptId, domain: r.domain, total: r.total, runsPresent: r.runsPresent })),
			runsByPrompt: RUNS_BY_PROMPT,
			brandCitedPromptIds,
			prompts: PROMPTS,
		}),
		scoreboard: computeScoreboard({ edges: edges.map((e) => ({ model: e.model, domain: e.domain, count: e.count })), brandDomains: BRAND, competitors: COMPETITORS }),
		domainTable: [...totals]
			.map(([domain, citations]) => ({
				domain,
				category: catOf(domain),
				citations,
				rating: RATINGS[domain] ?? null,
				volatility: Number((((citations * 7) % 30) / 10).toFixed(2)),
			}))
			.sort((a, b) => b.citations - a.citations),
		urlTable: URLS.map((u) => ({
			url: u.url,
			title: u.title,
			domain: u.domain,
			category: catOf(u.domain),
			citations: u.count,
			avgPosition: Number(((u.count % 5) + 1).toFixed(1)),
			prompts: Math.max(1, Math.round(u.count / 2)),
		})),
		drBySourceType: summarizeDrBySourceType(
			URLS.map((u) => ({ ...u, isOwn: kindOf(u.domain) === "own", isCompetitor: kindOf(u.domain) === "competitor", rating: RATINGS[u.domain] ?? null })),
		),
		promptDistributions: computePromptDomainDistribution({
			rows: [...ppd].map(([k, total]) => {
				const [promptId, domain] = k.split("|");
				return { promptId, domain, citations: total, pages: Math.max(1, Math.round(total / 3)) };
			}),
			promptValues: Object.fromEntries(PROMPTS.map((p) => [p.id, p.value])),
			ratings: RATINGS,
			kindOf: Object.fromEntries(allDomains.map((d) => [d, kindOf(d)])),
		}),
		brandRating: RATINGS[BRAND[0]] ?? null,
		brandedShare: {
			branded: { brand: 52, total: 80, share: 0.65 },
			unbranded: { brand: 30, total: 200, share: 0.15 },
		},
		untrackedCompetitors: [
			{ domain: "newrival.com", citations: 142 },
			{ domain: "upstart-drinks.io", citations: 88 },
			{ domain: "sober-brand.co", citations: 51 },
		],
	};
}

export default {
	title: "Citations / Citation Landscape",
} satisfies Meta;

export const States = () => {
	const data = buildData();
	return (
		<div className="mx-auto max-w-3xl space-y-10 p-6">
			<div>
				<div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">Loaded</div>
				<CitationInsightsView data={data} />
			</div>
			<div>
				<div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">Ratings still warming</div>
				<CitationInsightsView data={{ ...data, pending: 6 }} />
			</div>
			<div>
				<div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">Initial load</div>
				<CitationInsightsView />
			</div>
			<div>
				<div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">Error</div>
				<CitationInsightsView isError />
			</div>
		</div>
	);
};
