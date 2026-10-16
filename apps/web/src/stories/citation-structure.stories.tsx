import type { Meta, StoryObj } from "@storybook/react";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ReactNode } from "react";
import { CitationStructureCard } from "@/components/citations/citation-structure-card";
import { buildCitationStructure, type OwnedCitationRow } from "@/lib/citation-structure";

const MODELS = ["chatgpt", "perplexity", "google-ai-mode", "gemini", "claude"];
const OWNED = new Set(["acme.com", "acmecrm.io"]);

/**
 * A mid-size SaaS site: marketing pages on the apex, a blog and comparison
 * pages, docs and help-centre subdomains, and a long tail. Weights per engine
 * follow the usual shape — Perplexity leans on docs, Google on the blog.
 */
const PAGES: { url: string; title: string; weights: number[] }[] = [
	{ url: "https://acme.com/", title: "Acme — The CRM for growing teams", weights: [38, 22, 18, 12, 9] },
	{ url: "https://acme.com/pricing", title: "Pricing | Acme", weights: [31, 26, 12, 9, 7] },
	{ url: "https://acme.com/integrations", title: "Integrations | Acme", weights: [9, 7, 4, 3, 2] },
	{ url: "https://acme.com/security", title: "Security & compliance | Acme", weights: [5, 6, 1, 2, 4] },
	{
		url: "https://acme.com/blog/best-crm-for-startups",
		title: "The 9 best CRMs for startups in 2026",
		weights: [24, 14, 29, 17, 3],
	},
	{
		url: "https://acme.com/blog/crm-migration-checklist",
		title: "CRM migration checklist: move without losing data",
		weights: [11, 9, 16, 8, 2],
	},
	{
		url: "https://acme.com/blog/sales-pipeline-stages",
		title: "Sales pipeline stages, explained",
		weights: [6, 3, 12, 7, 0],
	},
	{ url: "https://acme.com/blog/what-is-a-crm", title: "What is a CRM?", weights: [4, 2, 9, 6, 1] },
	{
		url: "https://acme.com/blog/lead-scoring-models",
		title: "Lead scoring models that work",
		weights: [2, 3, 5, 2, 0],
	},
	{ url: "https://acme.com/blog/crm-roi-calculator", title: "Calculating CRM ROI", weights: [1, 1, 3, 1, 0] },
	{ url: "https://acme.com/compare/acme-vs-hubspot", title: "Acme vs HubSpot", weights: [21, 18, 11, 8, 6] },
	{ url: "https://acme.com/compare/acme-vs-salesforce", title: "Acme vs Salesforce", weights: [17, 12, 8, 7, 5] },
	{ url: "https://acme.com/compare/acme-vs-pipedrive", title: "Acme vs Pipedrive", weights: [6, 5, 2, 2, 1] },
	{ url: "https://acme.com/customers/northwind", title: "How Northwind doubled pipeline", weights: [3, 4, 2, 1, 1] },
	{ url: "https://acme.com/customers/globex", title: "Globex case study", weights: [1, 2, 1, 0, 1] },
	{ url: "https://docs.acme.com/api/authentication", title: "Authentication — Acme API", weights: [8, 19, 2, 3, 11] },
	{ url: "https://docs.acme.com/api/webhooks", title: "Webhooks — Acme API", weights: [5, 14, 1, 2, 7] },
	{ url: "https://docs.acme.com/getting-started", title: "Getting started", weights: [7, 9, 3, 3, 4] },
	{ url: "https://docs.acme.com/import/csv", title: "Import contacts from CSV", weights: [3, 6, 2, 1, 2] },
	{ url: "https://docs.acme.com/sso/okta", title: "Set up SSO with Okta", weights: [1, 4, 0, 1, 3] },
	{
		url: "https://help.acme.com/articles/cancel-subscription",
		title: "Cancel your subscription",
		weights: [6, 4, 7, 3, 1],
	},
	{ url: "https://help.acme.com/articles/export-data", title: "Export your data", weights: [3, 5, 2, 2, 2] },
	{ url: "https://help.acme.com/articles/gdpr", title: "GDPR at Acme", weights: [1, 2, 1, 1, 2] },
	{
		url: "https://community.acme.com/t/zapier-vs-native-sync",
		title: "Zapier vs native sync?",
		weights: [2, 4, 3, 0, 0],
	},
	{ url: "https://community.acme.com/t/custom-fields-limit", title: "Custom fields limit", weights: [1, 2, 1, 0, 0] },
	{ url: "https://acmecrm.io/", title: "Acme CRM (EU)", weights: [1, 1, 2, 1, 0] },
	{ url: "https://status.acme.com/", title: "Acme Status", weights: [1, 2, 0, 0, 1] },
];

const rows: OwnedCitationRow[] = PAGES.flatMap((page) =>
	page.weights.flatMap((count, i) =>
		count > 0 ? [{ model: MODELS[i], url: page.url, title: page.title, count }] : [],
	),
);

const structure = buildCitationStructure({ rows, ownedDomains: OWNED, modelOrder: MODELS });
const allCitations = Math.round(structure.totalCitations / 0.137);

const smallSite = buildCitationStructure({
	rows: [
		{ model: "chatgpt", url: "https://acme.com/", title: "Acme", count: 14 },
		{ model: "chatgpt", url: "https://acme.com/pricing", title: "Pricing | Acme", count: 6 },
		{ model: "perplexity", url: "https://acme.com/", title: "Acme", count: 5 },
		{ model: "perplexity", url: "https://acme.com/blog/what-is-a-crm", title: "What is a CRM?", count: 4 },
		{ model: "perplexity", url: "https://docs.acme.com/getting-started", title: "Getting started", count: 3 },
	],
	ownedDomains: OWNED,
	modelOrder: MODELS,
});

function Shell({ children, dark }: { children: ReactNode; dark?: boolean }) {
	return (
		<TooltipProvider>
			<div className={dark ? "dark" : undefined}>
				<div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">
					<div className="@container/main mx-auto flex max-w-6xl flex-col gap-4">{children}</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Citations/Citation Structure",
	component: CitationStructureCard,
	parameters: { layout: "fullscreen" },
	args: { structure, brandName: "Acme", chartColors: DEFAULT_CHART_COLORS, allCitations },
	decorators: [
		(Story, context) => (
			<Shell dark={context.parameters.dark === true}>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof CitationStructureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dark: Story = { parameters: { dark: true } };

/** Hovering an engine in the legend isolates its flows down to the pages it cites. */
export const HighlightEngine: Story = {
	play: async ({ canvasElement }) => {
		const button = Array.from(canvasElement.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Perplexity"),
		);
		button?.focus();
	},
};

export const SmallSite: Story = { args: { structure: smallSite, allCitations: 640 } };

export const NoOwnedCitations: Story = {
	args: { structure: buildCitationStructure({ rows: [], ownedDomains: OWNED }), allCitations: 812 },
};
