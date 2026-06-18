/**
 * Stories for the "Citation landscape" section (CitationInsightsView).
 * Builds fixtures through the real pure utils so the shapes stay correct.
 */
import type { Meta } from "@storybook/react";
import { computePromptDomainDistribution, type DomainKind } from "@workspace/lib/citation-landscape";
import { CitationInsightsView, type CitationInsightsData } from "@/components/citations/citation-insights";
import type { CitationCategory } from "@/lib/domain-categories";

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

const KIND: Record<string, DomainKind> = { "acme.com": "own", "rival.com": "competitor", "trello.com": "competitor" };
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
	["p3", "chatgpt", "youtube.com", 3],
	["p3", "chatgpt", "acme.com", 2],
	["p4", "chatgpt", "trello.com", 5],
	["p4", "perplexity", "en.wikipedia.org", 2],
	["p5", "chatgpt", "reddit.com", 2],
	["p5", "chatgpt", "capterra.com", 2],
	["p6", "chatgpt", "acme.com", 4],
	["p6", "chatgpt", "g2.com", 2],
];

const URLS = [
	{ domain: "blog.workmgmt.com", url: "https://blog.workmgmt.com/best-pm-tools", title: "10 Best PM Tools (2024)", count: 5 },
	{ domain: "g2.com", url: "https://g2.com/categories/project-management", title: "Best Project Management Software", count: 7 },
	{ domain: "reddit.com", url: "https://reddit.com/r/productivity/comments/x", title: "What PM tool do you use?", count: 9 },
	{ domain: "youtube.com", url: "https://youtube.com/watch?v=abc", title: "Task tracking tutorial", count: 3 },
	{ domain: "acme.com", url: "https://acme.com/features", title: "Acme features", count: 6 },
	{ domain: "trello.com", url: "https://trello.com/", title: "Trello", count: 5 },
];

function buildData(): CitationInsightsData {
	const totals = new Map<string, number>();
	const ppd = new Map<string, number>();
	for (const [promptId, , domain, count] of E) {
		totals.set(domain, (totals.get(domain) ?? 0) + count);
		const k = `${promptId}|${domain}`;
		ppd.set(k, (ppd.get(k) ?? 0) + count);
	}
	const allDomains = [...totals.keys()];

	return {
		pending: 0,
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
		promptDistributions: computePromptDomainDistribution({
			rows: [...ppd].map(([k, total]) => {
				const [promptId, domain] = k.split("|");
				return { promptId, domain, citations: total, pages: Math.max(1, Math.round(total / 3)) };
			}),
			promptValues: Object.fromEntries(PROMPTS.map((p) => [p.id, p.value])),
			ratings: RATINGS,
			kindOf: Object.fromEntries(allDomains.map((d) => [d, kindOf(d)])),
		}),
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
