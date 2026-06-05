/**
 * Deterministic mock data for the analytics page stories (overview, share of
 * voice, opportunities). Values are fixed (no randomness) so screenshots are
 * stable across runs.
 */

/** Build N consecutive YYYY-MM-DD strings ending at `end` (inclusive). */
function buildDates(n: number, end = "2026-06-04"): string[] {
	const [y, m, d] = end.split("-").map(Number);
	const base = new Date(y, m - 1, d);
	const out: string[] = [];
	for (let i = n - 1; i >= 0; i--) {
		const dt = new Date(base);
		dt.setDate(base.getDate() - i);
		out.push(
			`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`,
		);
	}
	return out;
}

const DATES = buildDates(30);
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

// AI visibility: a mild upward wave settling around 72%.
const visibilityTimeSeries = DATES.map((date, i) => ({
	date,
	overall: clamp(58 + i * 0.5 + 7 * Math.sin(i / 3.5)),
	nonBranded: clamp(40 + i * 0.4 + 6 * Math.sin(i / 4)),
	branded: clamp(90 + 4 * Math.sin(i / 5)),
}));

export const mockDashboardSummary = {
	totalPrompts: 42,
	totalRuns: 3120,
	averageVisibility: 68,
	nonBrandedVisibility: 51,
	brandedVisibility: 92,
	lastUpdatedAt: "2026-06-04T09:12:00.000Z",
	visibilityTimeSeries,
	citationTimeSeries: [],
};

// Share of voice: brand hovering in the low-30s against three competitors.
const shareTimeSeries = DATES.map((date, i) => ({
	date,
	share: clamp(29 + i * 0.18 + 4 * Math.sin(i / 4.5)),
}));

export const mockShareOfVoice = {
	brandName: "Acme",
	brandShare: 0.34,
	totalRuns: 3120,
	model: null,
	shareTimeSeries,
	entries: [
		{ name: "Acme", mentions: 1062, share: 0.34, isBrand: true, prompts: 31 },
		{ name: "Globex", mentions: 905, share: 0.29, isBrand: false, prompts: 28 },
		{ name: "Initech", mentions: 686, share: 0.22, isBrand: false, prompts: 24 },
		{ name: "Umbrella", mentions: 467, share: 0.15, isBrand: false, prompts: 19 },
	],
};

type Tier = "won" | "high" | "medium" | "low" | "none";
interface Opp {
	promptId: string;
	prompt: string;
	runs: number;
	brandMentionRate: number;
	competitorMentionRate: number;
	weightedVolatility: number | null;
	stabilityScore: number | null;
	dayTransitions: number;
	opportunity: number;
	tier: Tier;
}

const opp = (
	promptId: string,
	prompt: string,
	brand: number,
	comp: number,
	stability: number | null,
	tier: Tier,
): Opp => ({
	promptId,
	prompt,
	runs: 120,
	brandMentionRate: brand,
	competitorMentionRate: comp,
	weightedVolatility: stability === null ? null : 1 - stability / 100,
	stabilityScore: stability,
	dayTransitions: 29,
	opportunity: tier === "won" || tier === "none" ? 0 : Math.round((comp - brand) * 1000) / 1000,
	tier,
});

export const mockOpportunities = {
	model: null,
	prompts: [
		opp("p1", "best crm for small business", 0.05, 0.82, 22, "high"),
		opp("p2", "top project management tools", 0.12, 0.78, 41, "high"),
		opp("p3", "affordable accounting software for startups", 0.18, 0.66, 73, "medium"),
		opp("p4", "what is the best help desk software", 0.31, 0.62, 58, "medium"),
		opp("p5", "tools for remote team collaboration", 0.44, 0.59, 86, "low"),
		opp("p6", "best alternative to spreadsheets for tracking sales", 0.28, 0.36, 34, "low"),
		opp("p7", "how to choose a marketing automation platform", 0.61, 0.55, 64, "won"),
		opp("p8", "acme vs globex pricing", 0.74, 0.48, 91, "won"),
		opp("p9", "what is customer relationship management", 0.04, 0.06, 12, "none"),
		opp("p10", "how do saas companies handle billing", 0.02, 0.05, null, "none"),
	],
};
