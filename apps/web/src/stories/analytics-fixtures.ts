/**
 * Deterministic mock data for the analytics page stories (overview, share of
 * voice, opportunities). Values are fixed (no randomness) so screenshots are
 * stable across runs.
 */

import type { BrandSentiment } from "@/server/analytics-core";

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

const MODELS = ["chatgpt", "claude", "gemini", "perplexity", "google-ai-overview"];

const wave = (base: number, amp: number, phase: number, drift: number, digits = 3) =>
	DATES.map((_, i) => Number((base + drift * i + amp * Math.sin(i / 4 + phase)).toFixed(digits)));

// Each company's overall standing; per-day and per-model values wobble around it.
const COMPANIES = [
	{ name: "Acme", domain: "acme.com", isBrand: true, visibility: 0.62, share: 0.31, sentiment: 0.65, position: 1.8 },
	{
		name: "HubSpot",
		domain: "hubspot.com",
		isBrand: false,
		visibility: 0.71,
		share: 0.27,
		sentiment: 0.52,
		position: 1.6,
	},
	{
		name: "Salesforce",
		domain: "salesforce.com",
		isBrand: false,
		visibility: 0.44,
		share: 0.17,
		sentiment: 0.44,
		position: 2.4,
	},
	{
		name: "Pipedrive",
		domain: "pipedrive.com",
		isBrand: false,
		visibility: 0.29,
		share: 0.11,
		sentiment: 0.31,
		position: 2.9,
	},
	{ name: "Zoho", domain: "zoho.com", isBrand: false, visibility: 0.18, share: 0.07, sentiment: 0.47, position: 3.1 },
	{
		name: "Freshworks",
		domain: "freshworks.com",
		isBrand: false,
		visibility: 0.12,
		share: 0.05,
		sentiment: 0.37,
		position: 3.4,
	},
];

const METRICS = ["visibility", "share", "sentiment", "position"] as const;

/** Shifts a line so it ends on `target`: as in the app, the last day is the current figure. */
const endingAt = (values: number[], target: number) => {
	const shift = target - values[values.length - 1];
	return values.map((v) => Math.round((v + shift) * 1000) / 1000);
};

/** 600 current mentions of a company, split so the positive share is `positive`. */
const sentimentsFor = (positive: number) => {
	const pos = Math.round(positive * 600);
	const negative = Math.round((600 - pos) * 0.15);
	const mixed = Math.round((600 - pos) * 0.2);
	return { positive: pos, neutral: 600 - pos - negative - mixed, mixed, negative };
};

export const mockLandscape = {
	dates: DATES,
	models: MODELS,
	companies: COMPANIES.map((c, ci) => ({
		name: c.name,
		isBrand: c.isBrand,
		domain: c.domain,
		totals: { visibility: c.visibility, share: c.share, sentiment: c.sentiment, position: c.position },
		sentiments: sentimentsFor(c.sentiment),
		byModel: Object.fromEntries(
			MODELS.map((model, mi) => {
				const wobble = Math.sin((ci + 3) * (mi + 1)) * 0.12;
				return [
					model,
					Object.fromEntries(
						METRICS.map((metric) => [
							metric,
							metric === "position" ? Math.max(1, c.position * (1 + wobble)) : Math.min(1, c[metric] * (1 + wobble)),
						]),
					),
				];
			}),
		),
		series: {
			visibility: endingAt(wave(c.visibility - 0.04, 0.03, ci, 0.0015), c.visibility),
			share: endingAt(wave(c.share - 0.02, 0.015, ci + 1, 0.0008), c.share),
			sentiment: endingAt(wave(c.sentiment - 0.03, 0.03, ci + 2, 0.001), c.sentiment),
			position: endingAt(wave(c.position + 0.2, 0.15, ci + 3, -0.007), c.position),
		},
	})),
};

const brandSeries = (metric: (typeof METRICS)[number]) =>
	DATES.map((date, i) => ({ date, value: mockLandscape.companies[0].series[metric][i] }));

const headline = (metric: (typeof METRICS)[number]) => {
	const series = brandSeries(metric);
	const first = series[0].value;
	const last = series[series.length - 1].value;
	return { value: last, change: last - first, series };
};

export const mockDashboardSummary = {
	totalPrompts: 42,
	totalRuns: 3120,
	lastUpdatedAt: "2026-06-04T09:12:00.000Z",
	cards: {
		visibility: headline("visibility"),
		share: headline("share"),
		sentiment: headline("sentiment"),
		position: headline("position"),
	},
	landscape: mockLandscape,
};

export const mockShareOfVoice = {
	brandName: "Acme",
	brandShare: 0.31,
	totalRuns: 3120,
	model: null,
	entries: [
		{ name: "Acme", mentions: 1050, share: 0.31, isBrand: true, prompts: 31 },
		{ name: "HubSpot", mentions: 915, share: 0.27, isBrand: false, prompts: 28 },
		{ name: "Salesforce", mentions: 576, share: 0.17, isBrand: false, prompts: 24 },
		{ name: "Pipedrive", mentions: 373, share: 0.11, isBrand: false, prompts: 19 },
		{ name: "Zoho", mentions: 237, share: 0.07, isBrand: false, prompts: 12 },
		{ name: "Freshworks", mentions: 170, share: 0.05, isBrand: false, prompts: 9 },
	],
};

/** Mock opportunities report (the getOpportunitiesFn response shape). */
export const mockOpportunities = {
	reason: null,
	generatedFor: { brandName: "Acme" },
	lastEvaluatedAt: "2026-06-04T09:12:00.000Z",
	report: {
		summary: [
			"Acme is out-cited by Globex and Initech on nearly every unbranded category question.",
			"Those answers lean on review sites and 'best CRM' roundups (G2, Capterra, PCMag) where competitors show up and Acme rarely does.",
			"Fastest wins are wide-open comparison and community surfaces; the entrenched media roundups are higher-effort, longer plays.",
		],
		opportunities: [
			{
				category: "creation",
				title: "Win the 'Acme vs Globex' and 'CRM alternatives' comparisons",
				why: "Buyers comparing CRMs see Globex named in most AI answers and you almost never — a neutral side-by-side gives assistants a reason to put Acme in the conversation.",
				relatedPrompts: [
					{ text: "acme vs globex pricing", promptId: "p8" },
					{ text: "best alternative to spreadsheets for tracking sales", promptId: "p6" },
				],
				yourCitations: [],
				competitorCitations: [
					{ title: "Globex vs the alternatives", domain: "globex.com", url: "https://globex.com/compare" },
				],
			},
			{
				category: "creation",
				title: "Create a link-worthy 'best CRM for small business' resource",
				why: "Globex wins this high-volume question through roundups you're absent from; a strong, citable resource of your own gives editors and assistants something to point to.",
				relatedPrompts: [{ text: "best crm for small business", promptId: "p1" }],
				yourCitations: [],
				competitorCitations: [
					{ title: "Globex for Small Business", domain: "globex.com", url: "https://globex.com/smb" },
				],
			},
			{
				category: "creation",
				title: "Publish a definitive 'CRM for startups' guide",
				why: "No source owns the startup-CRM explainer answers and the citations there keep changing, so a clear guide can claim them before a competitor does.",
				relatedPrompts: [
					{ text: "affordable accounting software for startups", promptId: "p3" },
					{ text: "what is customer relationship management", promptId: "p9" },
				],
				yourCitations: [],
				competitorCitations: [],
			},
			{
				category: "existing-content",
				title: "Shore up your Help Desk guide before it slips",
				why: "You already get cited for this answer, but a Globex page is gaining ground — reinforcing the page you have protects citations you're about to lose.",
				relatedPrompts: [{ text: "what is the best help desk software", promptId: "p4" }],
				yourCitations: [{ title: "Acme Help Desk Guide", domain: "acme.com", url: "https://acme.com/help-desk-guide" }],
				competitorCitations: [{ title: "Globex Help Desk", domain: "globex.com", url: "https://globex.com/help-desk" }],
			},
			{
				category: "outreach",
				title: "Run a verified-review drive on G2 and Capterra",
				why: "Review sites are the pages AI cites most for CRM picks, and competitors out-review you there — more recent reviews are the cheapest way to start getting named.",
				relatedPrompts: [
					{ text: "best crm for small business", promptId: "p1" },
					{ text: "tools for remote team collaboration", promptId: "p5" },
				],
				yourCitations: [{ title: "Acme CRM", domain: "acme.com", url: "https://acme.com" }],
				competitorCitations: [{ title: "Globex CRM", domain: "globex.com", url: "https://globex.com/crm" }],
			},
			{
				category: "outreach",
				title: "Earn inclusion in the major 'best CRM' roundups",
				why: "PCMag, Forbes Advisor and TechRadar are cited again and again for your biggest gaps but list competitors, not you — one inclusion can surface Acme across many related questions.",
				relatedPrompts: [
					{ text: "best crm for small business", promptId: "p1" },
					{ text: "top project management tools", promptId: "p2" },
				],
				yourCitations: [],
				competitorCitations: [
					{ title: "Globex for Small Business", domain: "globex.com", url: "https://globex.com/smb" },
				],
			},
			{
				category: "social",
				title: "Answer recurring 'which CRM' threads on r/CRM",
				why: "These Reddit threads feed a lot of AI answers and rotate often, so genuine, disclosed answers can get Acme surfaced quickly — competitors are already named there.",
				relatedPrompts: [
					{ text: "how do saas companies handle billing", promptId: "p10" },
					{ text: "what is customer relationship management", promptId: "p9" },
				],
				yourCitations: [],
				competitorCitations: [{ title: "Globex CRM overview", domain: "globex.com", url: "https://globex.com/crm" }],
			},
			{
				category: "social",
				title: "Seed honest comparison demos on YouTube",
				why: "Video walkthroughs get pulled into AI answers for evaluation questions, where competitor demos currently dominate and you're not represented.",
				relatedPrompts: [{ text: "best alternative to spreadsheets for tracking sales", promptId: "p6" }],
				yourCitations: [],
				competitorCitations: [],
			},
		],
		risks: [
			"The big media roundups are locked-in and slow to crack — treat them as longer plays, not quick wins.",
			"Several 'vs' queries are answered from competitor-owned domains you can't get listed on; focus on independent comparisons instead.",
			"Skip incentivized or fake reviews — assistants increasingly discount coordinated, inauthentic activity.",
		],
	},
};

const summary = (positive: number, neutral: number, mixed: number, negative: number) => {
	const clear = positive + neutral + mixed + negative;
	return {
		positive,
		neutral,
		mixed,
		negative,
		score: (positive + (neutral + mixed) / 2) / clear,
	};
};

export const mockBrandSentiment: BrandSentiment = {
	prompts: [
		{ promptId: "p5", value: "cheapest crm for startups", tags: ["pricing"], sentiment: summary(1, 4, 0, 2) },
		{
			promptId: "p4",
			value: "enterprise crm with custom reporting",
			tags: ["enterprise"],
			sentiment: summary(4, 8, 2, 4),
		},
		{
			promptId: "p2",
			value: "acme vs hubspot pricing",
			tags: ["branded", "pricing"],
			sentiment: summary(30, 30, 12, 12),
		},
		{ promptId: "p3", value: "crm with best mobile app", tags: ["mobile"], sentiment: summary(30, 12, 2, 2) },
		{ promptId: "p1", value: "best crm for small sales teams", tags: ["crm"], sentiment: summary(60, 12, 3, 1) },
	],
	criticism: [
		{
			runId: "r1",
			promptId: "p4",
			prompt: "enterprise crm with custom reporting",
			model: "perplexity",
			createdAt: "2026-06-02T10:00:00.000Z",
			sentiment: "negative",
			// Passages start wherever they did in the answer, structure and all.
			passage:
				"1. **Acme** — reporting is limited compared with Salesforce; custom dashboards need an add-on and exports are capped.",
		},
		{
			runId: "r2",
			promptId: "p5",
			prompt: "cheapest crm for startups",
			model: "gemini",
			createdAt: "2026-06-01T10:00:00.000Z",
			sentiment: "negative",
			passage:
				"Several reviewers note that Acme raised prices twice last year, which pushed some small teams elsewhere.",
		},
	],
	mixed: [
		{
			runId: "r3",
			promptId: "p2",
			prompt: "acme vs hubspot pricing",
			model: "claude",
			createdAt: "2026-05-31T10:00:00.000Z",
			sentiment: "mixed",
			passage:
				"### Acme vs HubSpot\n\n- Acme is easier to learn, though its higher tiers cost more than HubSpot for the same seats.\n- Both offer a free plan.",
		},
	],
	praise: [
		{
			runId: "r4",
			promptId: "p1",
			prompt: "best crm for small sales teams",
			model: "chatgpt",
			createdAt: "2026-06-03T10:00:00.000Z",
			sentiment: "positive",
			passage:
				"For a small sales team, **Acme** is the easiest CRM to get running: setup takes an afternoon and the mobile app is genuinely good.",
		},
		{
			runId: "r5",
			promptId: "p3",
			prompt: "crm with best mobile app",
			model: "google-ai-overview",
			createdAt: "2026-06-02T10:00:00.000Z",
			sentiment: "positive",
			passage: "Users consistently rate Acme's mobile app highest for logging calls on the go.",
		},
	],
};
