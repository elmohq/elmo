import type { PromptResult, ScoreItem, SiteSignals } from "./types";

export const SCORE_WEIGHTS = {
	mentions: 45,
	position: 15,
	citations: 15,
	crawlers: 15,
	"structured-data": 7,
	"llms-txt": 3,
} as const;

export function positionValue(position: number | null): number {
	if (position === null) return 0;
	if (position === 1) return 1;
	if (position === 2) return 0.7;
	if (position === 3) return 0.5;
	return 0.3;
}

const SEARCH_CRAWLER_SHARE = 2 / 3;

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function computeScore(
	prompts: Pick<PromptResult, "mentioned" | "position" | "cited" | "failed">[],
	site: SiteSignals,
) {
	const answered = prompts.filter((prompt) => !prompt.failed);
	const total = answered.length;
	const mentioned = answered.filter((prompt) => prompt.mentioned).length;
	const cited = answered.filter((prompt) => prompt.cited).length;
	const positionSum = answered.reduce((sum, prompt) => sum + positionValue(prompt.position), 0);
	const share = (count: number) => (total === 0 ? 0 : count / total);

	const search = site.crawlers.filter((crawler) => crawler.kind === "search");
	const training = site.crawlers.filter((crawler) => crawler.kind === "training");
	const open = (list: SiteSignals["crawlers"]) =>
		list.length === 0 ? 1 : list.filter((crawler) => crawler.access !== "blocked").length / list.length;
	const crawlerShare = SEARCH_CRAWLER_SHARE * open(search) + (1 - SEARCH_CRAWLER_SHARE) * open(training);
	const blocked = site.crawlers.filter((crawler) => crawler.access === "blocked");

	const items: ScoreItem[] = [
		{
			key: "mentions",
			label: "Mentioned in AI answers",
			max: SCORE_WEIGHTS.mentions,
			points: round(SCORE_WEIGHTS.mentions * share(mentioned)),
			detail: `Named in ${mentioned} of ${plural(total, "answer")}`,
		},
		{
			key: "position",
			label: "Position when mentioned",
			max: SCORE_WEIGHTS.position,
			points: round(SCORE_WEIGHTS.position * (total === 0 ? 0 : positionSum / total)),
			detail:
				mentioned === 0
					? "Not named in any answer"
					: `Named first in ${answered.filter((prompt) => prompt.position === 1).length} of ${plural(total, "answer")}`,
		},
		{
			key: "citations",
			label: "Your site cited as a source",
			max: SCORE_WEIGHTS.citations,
			points: round(SCORE_WEIGHTS.citations * share(cited)),
			detail: `Cited in ${cited} of ${plural(total, "answer")}`,
		},
		{
			key: "crawlers",
			label: "AI crawler access",
			max: SCORE_WEIGHTS.crawlers,
			points: round(SCORE_WEIGHTS.crawlers * crawlerShare),
			detail:
				site.robotsTxt === "unreachable"
					? "Couldn't read robots.txt"
					: blocked.length === 0
						? "No AI crawlers blocked"
						: `Blocks ${blocked.map((crawler) => crawler.token).join(", ")}`,
		},
		{
			key: "structured-data",
			label: "Structured data on homepage",
			max: SCORE_WEIGHTS["structured-data"],
			points: site.structuredDataTypes.length > 0 ? SCORE_WEIGHTS["structured-data"] : 0,
			detail:
				site.structuredDataTypes.length > 0
					? `Found ${site.structuredDataTypes.slice(0, 4).join(", ")}`
					: "No JSON-LD found on the homepage",
		},
		{
			key: "llms-txt",
			label: "llms.txt",
			max: SCORE_WEIGHTS["llms-txt"],
			points: site.llmsTxt ? SCORE_WEIGHTS["llms-txt"] : 0,
			detail: site.llmsTxt ? "Found /llms.txt" : "No /llms.txt",
		},
	];

	return { total: Math.round(items.reduce((sum, item) => sum + item.points, 0)), items };
}
