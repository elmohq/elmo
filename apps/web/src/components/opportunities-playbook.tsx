/**
 * Opportunities — AEO command center, action-first.
 *
 * Every winnable prompt is sorted into the move that wins it, across four action
 * categories — Creation, Refresh, Outreach, Community — each with a few concrete
 * opportunity types.
 *
 * On top of that grouping:
 *  - each row benchmarks you against the best competitor (the bar to clear), not
 *    an aggregate, and names the concrete target to act on;
 *  - citation volatility is folded in as a plain "field" tag — Wide open
 *    (citations rotate → room to break in) vs Locked in (same sources win → you
 *    must get onto them) — and it's what surfaces "Untapped prompts".
 *
 * All types are computable from per-prompt mentions + the citations table
 * (domain composition via categorizeDomain, plus per-domain trend); no schema
 * change. Data here is mocked for the concept.
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { PromptOpportunity } from "@/server/analysis";

export type Category = "Creation" | "Refresh" | "Outreach" | "Community";
export type OppType =
	| "popular-gap"
	| "untapped"
	| "content-gap"
	| "almost"
	| "declining"
	| "weak-content"
	| "mention-gap"
	| "community";
export type Field = "open" | "contested" | "locked";

export type PlaybookPrompt = PromptOpportunity & {
	type: OppType;
	leader: { name: string; rate: number };
	/** The concrete thing to act on (a third-party domain, a competitor URL, or your URL). */
	target: string;
	field?: Field;
	/** Change in your citations over the window, pp (declining type; negative = slipping). */
	trendPp?: number;
};

const pct = (v: number) => Math.round(v * 100);

const TYPE_META: Record<OppType, { category: Category; title: string; desc: string; verb: string }> = {
	"popular-gap": { category: "Creation", title: "Popular prompt gaps", desc: "High-demand prompts where you're absent.", verb: "Create" },
	untapped: { category: "Creation", title: "Untapped prompts", desc: "Open fields nobody owns — citations rotate, so a strong page can claim them.", verb: "Claim with" },
	"content-gap": { category: "Creation", title: "Content gaps", desc: "Competitors win via their own pages; you have no equivalent.", verb: "Answer" },
	almost: { category: "Refresh", title: "Almost there", desc: "You're just behind the leader — a small push flips these.", verb: "Push" },
	declining: { category: "Refresh", title: "Declining citations", desc: "Your pages are cited less than they used to be.", verb: "Refresh" },
	"weak-content": { category: "Refresh", title: "Weak content", desc: "You're cited but not winning the mention — strengthen the page.", verb: "Strengthen" },
	"mention-gap": { category: "Outreach", title: "Mention gaps", desc: "Won on third-party sites you're not mentioned on.", verb: "Get listed on" },
	community: { category: "Community", title: "Cited discussions", desc: "Forum and community threads drive these answers.", verb: "Engage in" },
};

const CATEGORY_DESC: Record<Category, string> = {
	Creation: "Net-new pages — claim demand you don't have content for yet.",
	Refresh: "Update pages you already have so they win (or keep) the mention.",
	Outreach: "Earn mentions on the third-party sites these answers are built from.",
	Community: "Show up in the discussions AI is pulling its answers from.",
};

const CATEGORIES: Category[] = ["Creation", "Refresh", "Outreach", "Community"];

const FIELD: Record<Field, { label: string; cls: string }> = {
	open: { label: "Wide open", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
	contested: { label: "Contested", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
	locked: { label: "Locked in", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-300" },
};

function Row({ p }: { p: PlaybookPrompt }) {
	const meta = TYPE_META[p.type];
	return (
		<div className="flex items-center justify-between gap-3 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium" title={p.prompt}>
					{p.prompt}
				</div>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">
					{meta.verb} <span className="font-medium text-foreground">{p.target}</span>
					{p.trendPp != null && <span className="ml-1 text-rose-600 dark:text-rose-400">▼ {Math.abs(p.trendPp)}pp</span>}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2.5">
				<div className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
					You <span className="font-medium text-foreground">{pct(p.brandMentionRate)}%</span> · {p.leader.name}{" "}
					<span className="font-medium text-foreground">{pct(p.leader.rate)}%</span>
				</div>
				{p.field && (
					<span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${FIELD[p.field].cls}`}>
						{FIELD[p.field].label}
					</span>
				)}
			</div>
		</div>
	);
}

export function OpportunitiesPlaybook({ prompts }: { prompts: PlaybookPrompt[] }) {
	const byCategory = (c: Category) => prompts.filter((p) => TYPE_META[p.type].category === c);

	return (
		<PageHeader title="Opportunities" subtitle="What to do to win more AI mentions — grouped by the move, benchmarked against the leader.">
			<div className="space-y-6 pt-2">
				<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
					{CATEGORIES.map((c) => {
						const n = byCategory(c).length;
						return (
							<Card key={c} className="shadow-none">
								<CardContent className="py-4">
									<div className="text-2xl font-semibold tabular-nums">{n}</div>
									<div className="text-sm font-medium">{c}</div>
									<div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{CATEGORY_DESC[c]}</div>
								</CardContent>
							</Card>
						);
					})}
				</div>

				{CATEGORIES.map((category) => {
					const items = byCategory(category);
					if (items.length === 0) return null;
					const types = [...new Set(items.map((p) => p.type))];
					return (
						<Card key={category}>
							<CardHeader>
								<CardTitle className="text-base">{category}</CardTitle>
								<CardDescription>{CATEGORY_DESC[category]}</CardDescription>
							</CardHeader>
							<CardContent className="divide-y divide-border/60 pt-0">
								{types.map((type) => {
									const rows = items.filter((p) => p.type === type);
									const meta = TYPE_META[type];
									return (
										<div key={type} className="py-3 first:pt-0 last:pb-0">
											<div className="text-sm font-semibold">
												{meta.title} <span className="font-normal text-muted-foreground">({rows.length})</span>
											</div>
											<div className="text-xs text-muted-foreground">{meta.desc}</div>
											<div className="mt-1.5 divide-y divide-border/60">
												{rows.map((p) => (
													<Row key={p.promptId} p={p} />
												))}
											</div>
										</div>
									);
								})}
							</CardContent>
						</Card>
					);
				})}

				<p className="text-xs text-muted-foreground">
					Benchmark is the best competitor on each prompt (your minimum bar; 100% is the ceiling).{" "}
					<span className="font-medium">Wide open</span> = citations rotate across many sources, so there's room to break
					in; <span className="font-medium">Locked in</span> = the same sources win every time, so you must get onto them.
				</p>
			</div>
		</PageHeader>
	);
}
