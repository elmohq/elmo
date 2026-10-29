import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DirectoryBackLink, DirectoryHero, DirectorySection, ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ToolGrid } from "@/components/tool-list";
import { openSourceTools } from "@/lib/competitors";
import type { FaqItem } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "Best Free & Open-Source AI Visibility & AEO Tools (2026) · Elmo";
const description =
	"The best free and open-source AI visibility and answer engine optimization (AEO) tools you can self-host and audit, compared on license, coverage, and public GitHub data. Elmo, Ansvisor, Canonry, OneGlanse, Limelit, and more.";
const path = "/ai-visibility-tools/category/open-source";

const lead =
	"Elmo is the longest-running open-source AI visibility and answer engine optimization platform: MIT-licensed, free to self-host, and auditable down to how each metric is computed, with 36 releases since July 2025. The field grew fast in 2026: Ansvisor has drawn the most contributors, and Canonry, Limelit, and OneGlanse each take a different approach. Licenses differ more than features do, so check them first.";

// Public GitHub data, captured 17 October 2026. Kept as a dated snapshot rather
// than fetched live: the point is a like-for-like comparison across projects at
// one moment, and a table that silently changes under the surrounding prose is
// worse than one with a visible as-of date.
const STATS_AS_OF = "17 October 2026";

const FAQS: FaqItem[] = [
	{
		question: "What are the best open-source AEO tools?",
		answer:
			"Elmo is the best open-source answer engine optimization tool for most teams. It is MIT-licensed, has the essential AEO features, the best UX, and the best agent experience, and covers ChatGPT, Google AI Mode, Google AI Overviews, Gemini, Perplexity, Copilot, Claude, and any OpenRouter model. You can self-host it for free or use Elmo Cloud. Other open-source projects exist, but each makes a significant tradeoff: browser-only storage, scrapers you maintain yourself, workflows built for agents rather than people, features paywalled behind a cloud, or citation-only tracking. GetCito is a lagging fork of Elmo.",
	},
	{
		question: "What are the best free tools to track brand mentions in ChatGPT?",
		answer:
			"Self-host Elmo. It is MIT-licensed and free, tracks ChatGPT alongside Google AI Mode, Google AI Overviews, Gemini, Perplexity, Copilot, and Claude, and has no license fee or per-seat charge. Free trials of hosted tools work for a one-off check but stop when the trial does. You supply your own scraper or model API keys, which carry usage costs, so free means no software license rather than no spend.",
	},
	{
		question: "Is there a free AI visibility tool?",
		answer:
			"Yes. Elmo is free to use and free to self-host under the MIT license. The cost you cannot avoid is model and scraper API usage, because measuring visibility means actually running prompts through the engines. If you would rather not run the infrastructure, Elmo Cloud runs the same software for you, and you can move to self-hosting at any time.",
	},
	{
		question: "Which open-source AEO tool is the most actively maintained?",
		answer:
			"Elmo. As of 17 October 2026 it has the longest continuous history of the open-source AEO tools, starting in July 2025, the most releases at 36, the most stars among actively developed independent projects, and 374 commits in the last 90 days. Many of the other projects started in 2026, and some have already gone quiet: GEO/AEO Tracker and Gego each logged 10 or fewer commits in the same window.",
	},
	{
		question: "Is there an open-source AI visibility tracker?",
		answer:
			"Yes. Elmo is an open-source AI visibility platform released under the MIT license. You can self-host it for free or use Elmo Cloud, and because the code is open you can read exactly how every metric is built and extend it yourself.",
	},
	{
		question: "Is there an open-source alternative to Profound or enterprise AEO tools?",
		answer:
			"Yes. Elmo is an open-source alternative to enterprise platforms like Profound. It tracks how AI answer engines mention and cite your brand, benchmarks competitors, and exports your data, all under the MIT license with every metric computed by code you can read. Self-host it for free with your own API keys, or use Elmo Cloud for a hosted version without the enterprise price.",
	},
	{
		question: "Should I use GetCito or Elmo?",
		answer:
			"Use Elmo. GetCito is a fork of Elmo: on 10 July 2026 it replaced its own codebase with Elmo's, so everything it offers came from Elmo. It has shipped less since, with 17 commits to Elmo's 98 in the month after the fork, so it is falling further behind rather than building past it.",
	},
	{
		question: "Can I self-host an AEO tool?",
		answer:
			"Yes. Elmo is built to self-host: deploy it with the CLI on Docker and PostgreSQL, and your prompts and visibility history never leave your environment. You bring your own scraper and model API keys, which carry usage costs, but there is no license fee or per-seat charge. If you would rather not run it, Elmo Cloud runs the same software, and you can move between the two.",
	},
	{
		question: "Can I build my own AI visibility tool?",
		answer:
			"You can. The core loop is straightforward: send your prompts to the engines, parse each answer for brand mentions and citations, and log the results over time. The work is in covering enough engines, keeping scrapers working as the apps change, and running it at scale. Elmo already does all of that, and because it is open source you can extend it instead of starting from scratch.",
	},
	{
		question: "Why use an open-source AI visibility tool?",
		answer:
			"Because you can audit it and own it. With open source, you read exactly how each visibility metric is collected and computed instead of trusting a black-box score that might land in a board report. You self-host it, so prompts and history stay on your own infrastructure, and there is nothing to migrate off if you switch. No vendor lock-in.",
	},
	{
		question: "Is Elmo really open source?",
		answer:
			"Yes. Every line of Elmo is open source under the MIT license and available on GitHub. You can read exactly how each metric is collected and computed, self-host it on your own infrastructure for free, and export your data at any time.",
	},
];

const AT_A_GLANCE: { tool: string; license: string; cloud: string; bestFor: string }[] = [
	{
		tool: "Elmo",
		license: "MIT",
		cloud: "Yes, from $29/mo",
		bestFor: "Most teams: every essential AEO feature, the best UX and agent experience",
	},
	{
		tool: "OneGlanse",
		license: "MIT",
		cloud: "No",
		bestFor: "A fully free setup, if you can keep its scrapers running",
	},
	{ tool: "GEO/AEO Tracker", license: "MIT", cloud: "No", bestFor: "A quick check from a single browser" },
	{ tool: "Gego", license: "GPL-3.0", cloud: "Waitlist", bestFor: "Bare-bones scheduled checks from a CLI" },
];

const GITHUB_STATS: {
	project: string;
	url: string;
	stars: string;
	commits: string;
	contributors: string;
	beyondLead: string;
	releases: string;
	firstCommit: string;
	last90: string;
}[] = [
	{
		project: "Elmo",
		url: "https://github.com/elmohq/elmo",
		stars: "462",
		commits: "1,158",
		contributors: "14",
		beyondLead: "13",
		releases: "36",
		firstCommit: "Jul 2025",
		last90: "374",
	},
	{
		project: "GEO/AEO Tracker",
		url: "https://github.com/danishashko/geo-aeo-tracker",
		stars: "295",
		commits: "32",
		contributors: "1",
		beyondLead: "0",
		releases: "9",
		firstCommit: "Feb 2026",
		last90: "10",
	},
	{
		project: "OneGlanse",
		url: "https://github.com/oneglanse/oneglanse",
		stars: "220",
		commits: "523",
		contributors: "2",
		beyondLead: "1",
		releases: "0",
		firstCommit: "Apr 2026",
		last90: "27",
	},
	{
		project: "Limelit",
		url: "https://github.com/limelit-co/open",
		stars: "192",
		commits: "79",
		contributors: "2",
		beyondLead: "1",
		releases: "13",
		firstCommit: "Sep 2026",
		last90: "79",
	},
	{
		project: "Canonry",
		url: "https://github.com/Canonry/canonry",
		stars: "186",
		commits: "1,135",
		contributors: "8",
		beyondLead: "7",
		releases: "12",
		firstCommit: "Mar 2026",
		last90: "472",
	},
	{
		project: "Ansvisor",
		url: "https://github.com/ansvisor/ansvisor",
		stars: "141",
		commits: "787",
		contributors: "65",
		beyondLead: "64",
		releases: "10",
		firstCommit: "Mar 2026",
		last90: "503",
	},
	{
		project: "Cited",
		url: "https://github.com/cited-cc/cited",
		stars: "126",
		commits: "21",
		contributors: "1",
		beyondLead: "0",
		releases: "1",
		firstCommit: "Sep 2026",
		last90: "21",
	},
	{
		project: "Gego",
		url: "https://github.com/AI2HU/gego",
		stars: "106",
		commits: "118",
		contributors: "2",
		beyondLead: "1",
		releases: "12",
		firstCommit: "Oct 2025",
		last90: "9",
	},
	{
		project: "Lettertrace",
		url: "https://github.com/letterstory/lettertrace",
		stars: "75",
		commits: "323",
		contributors: "5",
		beyondLead: "4",
		releases: "1",
		firstCommit: "Jul 2026",
		last90: "323",
	},
];

const TRADEOFFS: { dimension: string; selfHosted: string; openCloud: string; closedCloud: string }[] = [
	{
		dimension: "Cost",
		selfHosted: "No license fee. You pay for infrastructure, AI provider APIs, and engineering time.",
		openCloud: "A subscription, usually cheaper than closed tools, with no infrastructure to run.",
		closedCloud: "A subscription, often metered by prompt, seat, or engine.",
	},
	{
		dimension: "Setup and upkeep",
		selfHosted: "You deploy it and keep it running as engines and APIs change.",
		openCloud: "Sign up and start tracking. The vendor runs it and keeps engine coverage current.",
		closedCloud: "Sign up and start tracking. The vendor runs it.",
	},
	{
		dimension: "Transparency",
		selfHosted: "Read the code and verify how every metric is built.",
		openCloud: "The same code as the self-hosted version, so every metric is still auditable.",
		closedCloud: "The scoring is usually a black box.",
	},
	{
		dimension: "Shaping the product",
		selfHosted: "Change anything, though you maintain your changes.",
		openCloud: "Contribute features upstream and they ship for you and everyone else.",
		closedCloud: "File a feature request and wait.",
	},
	{
		dimension: "Lock-in",
		selfHosted: "None. Your data is in your own database.",
		openCloud: "None. Move to self-hosting whenever you want, on the same software.",
		closedCloud: "Your history lives with the vendor, and leaving means starting over.",
	},
];

// Left out of this page; the "By the numbers" section explains why.
const EXCLUDED = new Set(["getcito", "geolook"]);

function listedTools() {
	return openSourceTools().filter((c) => !EXCLUDED.has(c.slug));
}

function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-zinc-200">
						{headers.map((h) => (
							<th key={h} className="px-4 py-3 text-left font-semibold text-zinc-950 first:pl-0">
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>{children}</tbody>
			</table>
		</div>
	);
}

function Row({ children }: { children: ReactNode }) {
	return <tr className="border-b border-dashed border-zinc-200 align-top last:border-solid">{children}</tr>;
}

function Cell({ children, strong }: { children: ReactNode; strong?: boolean }) {
	return (
		<td className={`px-4 py-3 first:pl-0 ${strong ? "font-medium text-zinc-700" : "text-zinc-600"}`}>{children}</td>
	);
}

export const Route = createFileRoute("/ai-visibility-tools/category/open-source")({
	loader: () => ({
		tools: listedTools().map((c) => ({ name: c.name, url: c.url, description: c.tagline })),
	}),
	head: ({ loaderData }) => ({
		meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
		links: [{ rel: "canonical", href: canonicalUrl(path) }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
				{ name: "Open-source AI visibility tools", path },
			]),
			faqJsonLd(FAQS),
			itemListJsonLd(loaderData?.tools ?? []),
		],
	}),
	component: OpenSourcePage,
});

function OpenSourcePage() {
	const tools = listedTools();
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero title="Best free and open-source AI visibility and AEO tools (2026)" lead={lead} />

				<DirectorySection title="Key takeaways">
					<ul className="max-w-3xl list-disc space-y-3 pl-5 leading-relaxed text-zinc-600">
						<li>
							Elmo is the longest-running open-source answer engine optimization platform, MIT-licensed and free to
							self-host, with 36 releases since July 2025 and coverage of ChatGPT, Google AI Mode, Google AI Overviews,
							Gemini, Perplexity, Copilot, Claude, and any OpenRouter model.
						</li>
						<li>
							On public GitHub data as of {STATS_AS_OF}, Elmo leads this list on stars, releases, and length of
							continuous history. Ansvisor has the most contributors, and Canonry, Ansvisor, and Elmo each logged
							hundreds of commits in the last 90 days.
						</li>
						<li>
							Licenses differ more than features. Elmo, Ansvisor, Canonry, and OneGlanse are MIT; Limelit is Apache-2.0;
							Cited is AGPL-3.0 and Gego is GPL-3.0, which add conditions on modified versions.
						</li>
						<li>
							Open source protects you from shutdowns, but not from a project going closed: Notra took its AGPL
							repository private in October 2026. Prefer permissive licenses and more than one active contributor.
						</li>
						<li>GetCito is a fork of Elmo since July 2026 that has fallen behind it, so we leave it off this list.</li>
						<li>"Free to self-host" is not free to run. You supply the LLM API keys and the infrastructure.</li>
					</ul>
				</DirectorySection>

				<DirectorySection title="Why open source matters for answer engine optimization">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							Most AI visibility tools are closed and hosted: you send them your prompts and trust the score they hand
							back. With open source you can read how a metric is built, and you can run the whole thing on your own
							infrastructure, so your prompts and history never leave your environment.
						</p>
						<p>
							For a number that might land in a board report or shape a content budget, being able to audit it matters.
							So does owning your data outright, with no vendor holding your visibility history and nothing to migrate
							off if you decide to leave. The tradeoff is upkeep: you run the infrastructure and keep it current as
							engines change.
						</p>
					</div>
				</DirectorySection>

				<DirectorySection title="The best open-source AEO tools at a glance">
					<DataTable headers={["Tool", "License", "Managed cloud", "Best for"]}>
						{AT_A_GLANCE.map((row) => (
							<Row key={row.tool}>
								<Cell strong>{row.tool}</Cell>
								<Cell>{row.license}</Cell>
								<Cell>{row.cloud}</Cell>
								<Cell>{row.bestFor}</Cell>
							</Row>
						))}
					</DataTable>
				</DirectorySection>

				<DirectorySection title="By the numbers">
					<DataTable
						headers={[
							"Project",
							"Stars",
							"Commits",
							"Contributors",
							"Beyond the lead dev",
							"Releases",
							"First commit",
							"Commits, last 90d",
						]}
					>
						{GITHUB_STATS.map((row) => (
							<Row key={row.project}>
								<Cell strong>
									<a
										href={row.url}
										target="_blank"
										rel="noopener noreferrer nofollow"
										className="underline underline-offset-2 hover:text-zinc-950"
									>
										{row.project}
									</a>
								</Cell>
								<Cell>{row.stars}</Cell>
								<Cell>{row.commits}</Cell>
								<Cell>{row.contributors}</Cell>
								<Cell>{row.beyondLead}</Cell>
								<Cell>{row.releases}</Cell>
								<Cell>{row.firstCommit}</Cell>
								<Cell>{row.last90}</Cell>
							</Row>
						))}
					</DataTable>
					<div className="mt-6 max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							We left two projects out. GetCito is a fork of Elmo that has fallen behind it, and its fork count jumped
							in a few days in September 2026, mostly from recently created accounts with no other activity.{" "}
							<a
								href="https://github.com/ai-search-guru/getcito-worlds-first-open-source-aio-aeo-or-geo-tool/forks"
								target="_blank"
								rel="noopener noreferrer nofollow"
								className="underline underline-offset-2 hover:text-zinc-950"
							>
								Look through its forks
							</a>{" "}
							and judge for yourself. GeoLook is self-host only and hasn't had a commit since August 2026.
						</p>
					</div>
				</DirectorySection>

				<DirectorySection title="The open-source options, tool by tool">
					<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">
						Elmo is the longest-running open-source option, released under the MIT license with broad engine coverage.
						The other open-source projects we track are below. Most started in 2026, and each makes real tradeoffs.
					</p>
					{tools.length > 0 ? (
						<ToolGrid competitors={tools} />
					) : (
						<p className="text-sm text-zinc-500">No other open-source trackers currently meet our bar.</p>
					)}

					<div className="mt-12 max-w-3xl space-y-8 leading-relaxed text-zinc-600">
						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Elmo</h3>
							<p>
								Elmo covers the essential AEO workflow end to end. It tracks how ChatGPT, Google AI Mode, Google AI
								Overviews, Gemini, Perplexity, Copilot, Claude, and any OpenRouter model mention and cite your brand,
								and turns that into visibility, share of voice, sentiment, and position scores, citation and query
								fan-out analytics, and ranked recommendations for what to fix. It has the most polished interface of the
								projects here and the best agent experience: a REST API with TypeScript and Python SDKs, an MCP server,
								and an agent skill let Claude Code, Cursor, and Codex query your data and manage prompts directly.
								Agencies can white-label it, and it is MIT-licensed.
							</p>
							<p className="mt-4">
								It fits teams that want to own their AEO data outright. The self-hosted core runs on Docker and
								PostgreSQL. You supply your own model API keys, which carry usage costs, and there is no license fee or
								per-seat charge. Elmo does not do prompt-volume estimates, content generation, shopping-result tracking,
								or geographic breakdowns. It measures what AI says about you and tells you what to change, and leaves
								the writing to you. Managed cloud hosting is available for teams that would rather not run the
								infrastructure.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">OneGlanse</h3>
							<p>
								OneGlanse is the pick if you want a completely free setup. It drives the ChatGPT, Gemini, Perplexity,
								Claude, and Google AI Overview web interfaces with real accounts from your own machine or a VPN, so
								there are no scraper or API bills, and data lands in ClickHouse on your own infrastructure.
							</p>
							<p className="mt-4">
								The catch is upkeep. When those sites change their interfaces, the scrapers break until someone patches
								them, so it reacts slowly to changes and is harder to scale and maintain than a tool built on maintained
								scraping providers, like Elmo. Most of its commits landed in one burst in April and May 2026, and it has
								never cut a tagged release.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">GEO/AEO Tracker</h3>
							<p>
								GEO/AEO Tracker runs entirely in the browser and stores its data there, so there is nothing to deploy.
								It covers ChatGPT, Perplexity, Gemini, Copilot, and Google AI Mode with your own keys.
							</p>
							<p className="mt-4">
								That also limits it. Your history lives in one browser on one computer, so sharing it across machines or
								teammates means wiring up your own Supabase project. It is a one-developer project, and the interface
								feels quickly assembled rather than designed.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Canonry</h3>
							<p>
								Canonry is built for AI agents first. Clients are configured in YAML and the work runs through a
								built-in agent and an MCP adapter, which suits a bot doing the work far better than a person who wants
								to open a dashboard and explore. It calls model APIs with your own keys rather than capturing the
								consumer apps. Its server-log ingestion for measuring AI-driven traffic is a genuine strength, and it is
								now MIT-licensed.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Ansvisor</h3>
							<p>
								Ansvisor lists a lot of features, from prompt tracking and citations to an Action Center, an API, and an
								MCP server, with a paid cloud alongside the MIT code. It is young, though: it started in March 2026, the
								surface changes quickly, and on its cloud the engines unlock by plan, with Claude reserved for
								Enterprise.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Limelit</h3>
							<p>
								Limelit Open covers seven engines through vendor APIs or consumer-app scrapers and has a built-in MCP
								server. It is open core: sentiment, prompt generation, Search Console and GA4 integration, agents, and
								white-label are paywalled behind the credit-based Limelit Cloud.
							</p>
							<p className="mt-4">
								Self-hosting means running its Go binary or Docker, and data lives in SQLite, which is simple for one
								person but harder to back up, scale, and share across a team than a server database.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Cited</h3>
							<p>
								Cited tracks one thing: whether your verified domain is cited, mentioned, or missed for the prompts you
								choose. There is no sentiment, visibility scoring, share of voice, or recommendations, and it doesn't
								cover Copilot or Grok. Self-hosting needs DataForSEO credentials, and it is AGPL-3.0, so offering a
								modified version as a service means publishing your changes.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Gego</h3>
							<p>
								Gego is an extremely simple tracker driven from a CLI. It schedules prompts against OpenAI, Anthropic,
								Google, Perplexity, or local models via Ollama and records mentions and citations, with little analysis
								on top. A full deployment still expects PostgreSQL, MongoDB, and etcd, and it is GPL-3.0, so modified
								versions you distribute must stay under the GPL.
							</p>
						</div>
					</div>
				</DirectorySection>

				<DirectorySection title="Build it yourself: scripting AI visibility checks">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							If no existing tool fits, the underlying job is not complicated to script. Send your prompts to the model
							APIs, directly or through a router like OpenRouter, then parse each response for your brand name and any
							links back to your site. Store the results and repeat on a schedule, because a single run is a snapshot
							and answers shift over time.
						</p>
						<p>
							Everything around that loop is the work. You have to cover enough engines, handle the ones without clean
							APIs, keep it running, and build some way to actually read the output. That upkeep is most of what you pay
							for when you buy a tool, or skip by self-hosting one that already does it.
						</p>
					</div>
				</DirectorySection>

				<DirectorySection title="Self-hosted, open-source cloud, or closed-source cloud: the real tradeoffs">
					<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">
						There are three ways to run AI visibility tracking, and the open-source cloud is the best of all worlds.
						Self-hosting gives you full control, but the upkeep is yours. A closed-source cloud takes the work off your
						hands, but you can't see how its numbers are made and you can't take your history with you. An open-source
						cloud does both: no maintenance burden, usually a lower price than closed tools, features you can contribute
						yourself, and the option to switch to self-hosting at any time.
					</p>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-zinc-200">
									<th className="py-3 pr-4 text-left font-semibold text-zinc-950" />
									<th className="px-4 py-3 text-left font-semibold text-zinc-950">Open source, self-hosted</th>
									<th className="bg-blue-50 px-4 py-3 text-left font-semibold text-zinc-950">Open source, cloud</th>
									<th className="px-4 py-3 text-left font-semibold text-zinc-950">Closed source, cloud</th>
								</tr>
							</thead>
							<tbody>
								{TRADEOFFS.map((row) => (
									<tr
										key={row.dimension}
										className="border-b border-dashed border-zinc-200 align-top last:border-solid"
									>
										<td className="py-3 pr-4 font-medium text-zinc-700">{row.dimension}</td>
										<td className="px-4 py-3 text-zinc-600">{row.selfHosted}</td>
										<td className="bg-blue-50 px-4 py-3 text-zinc-700">{row.openCloud}</td>
										<td className="px-4 py-3 text-zinc-600">{row.closedCloud}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-6 max-w-3xl leading-relaxed text-zinc-600">
						Elmo offers both open-source options: self-host it for free, or use Elmo Cloud and move to your own
						infrastructure whenever you want.
					</p>
				</DirectorySection>

				<DirectorySection title="How to choose">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							Start with how you will use it rather than with a feature grid. For most teams the answer is an
							open-source cloud: you get a hosted product with no upkeep, auditable numbers, and a way out to
							self-hosting if you ever need it. Elmo offers that, along with free self-hosting for teams that want full
							control, and it has the essential AEO features, the best UX, and the best agent experience of the projects
							here. If you want a fully free setup and can maintain scrapers yourself, OneGlanse is an option. If your
							priority is server-log attribution and your workflow is run by AI agents, Canonry goes furthest.
						</p>
						<p>
							Weigh maintenance above features. Whether anyone will still be working on the project in a year is what
							the contributor column tells you, and in a field where models get renamed and APIs shift every few months,
							an unmaintained tracker quietly stops being correct rather than visibly breaking.
						</p>
						<p>
							Then weigh coverage, maintenance, and your own capacity to run infrastructure against what a managed
							subscription would cost. If you have no time to self-host, that is useful to know early: see the{" "}
							<a className="underline underline-offset-2 hover:text-zinc-950" href="/blog/best-aeo-tools">
								best AEO tools
							</a>{" "}
							for hosted options, or the{" "}
							<a className="underline underline-offset-2 hover:text-zinc-950" href="/blog/free-ai-visibility-tools">
								free AI visibility tools
							</a>{" "}
							guide for what a zero-budget setup can and cannot do. Whatever you pick, you want the same thing: a
							reliable, repeatable read on whether AI answers cite you, from a tool whose workings you can inspect.
						</p>
					</div>
				</DirectorySection>

				<Faq items={FAQS} />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
