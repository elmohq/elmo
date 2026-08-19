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

const title = "Best Open-Source AEO Tools (2026) · Elmo";
const description =
	"The best open-source answer engine optimization (AEO) tools you can self-host and audit, ranked on public GitHub data. Elmo, OneGlanse, GEO/AEO Tracker, Canonry, and Gego compared.";
const path = "/ai-visibility-tools/category/open-source";

const lead =
	"The most complete open-source answer engine optimization tool is Elmo: MIT-licensed, free to self-host, and auditable down to how each metric is computed. Smaller projects like OneGlanse, GEO/AEO Tracker, and Gego exist alongside it. This is a thin, early space, and the honest picture is one mature platform, a handful of small projects, and the option to script your own checks.";

// Public GitHub data, captured 11 August 2026. Kept as a dated snapshot rather
// than fetched live: the point is a like-for-like comparison across projects at
// one moment, and a table that silently changes under the surrounding prose is
// worse than one with a visible as-of date.
const STATS_AS_OF = "11 August 2026";

const FAQS: FaqItem[] = [
	{
		question: "What are the best open-source AEO tools?",
		answer:
			"Elmo is the most complete open-source answer engine optimization tool: MIT-licensed, free to self-host, and covering ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews. Public GitHub data as of 11 August 2026 backs this up — Elmo leads the field on stars, contributors, and releases, and is the only project with a meaningful number of contributors beyond one person. Smaller projects fill out the rest of the space, including OneGlanse, GEO/AEO Tracker, and Gego, most of them single-developer efforts. Canonry is actively developed but source-available rather than fully open source. GetCito is not a separate option at all: it replaced its codebase with Elmo's in July 2026 and swapped the copyright notice, so running it means running an out-of-date copy of Elmo.",
	},
	{
		question: "Which open-source AEO tool is the most actively maintained?",
		answer:
			"By GitHub activity on 11 August 2026, Elmo has the strongest sustained record: 862 commits over 13 months, 206 in the last 90 days, 19 releases, and 10 contributors. Canonry logged more raw commits in that window (500), but 451 came from one developer and it is source-available rather than open source. OneGlanse has not had a commit since 10 May 2026, and GEO/AEO Tracker and GetCito have 28 and 35 total commits respectively.",
	},
	{
		question: "Is there an open-source AI visibility tracker?",
		answer:
			"Yes. Elmo is an open-source AI visibility platform released under the MIT license, and you can self-host it for free. A few smaller open-source projects exist too, though the space is still early. For anything they don't cover, you can script your own checks against the AI model APIs.",
	},
	{
		question: "Is there an open-source alternative to Profound or enterprise AEO tools?",
		answer:
			"Yes. Elmo is an open-source, self-hostable alternative to enterprise platforms like Profound. It tracks how AI answer engines mention and cite your brand, benchmarks competitors, and exports your data, all under the MIT license with every metric computed by code you can read. You run the infrastructure and supply your own model API keys instead of paying a subscription.",
	},
	{
		question: "Should I use GetCito or Elmo?",
		answer:
			"Use Elmo. If you are considering GetCito, Elmo is what you actually want, because GetCito is a copy of it — on 10 July 2026 it replaced its codebase with Elmo's and swapped the copyright notice on the license. Everything it offers came from Elmo, and it has shipped far less since — 17 commits to Elmo's 98 in the month after the copy — so it is drifting further behind rather than building past it.",
	},
	{
		question: "Can I self-host an AEO tool?",
		answer:
			"Yes. Several open-source answer engine optimization tools are built to self-host. Elmo runs on Docker and PostgreSQL on your own infrastructure, so your prompts and visibility history never leave your environment. OneGlanse, GEO/AEO Tracker, and Canonry are self-hostable too. You bring your own LLM API keys, which carry usage costs, but there is no license fee or per-seat charge.",
	},
	{
		question: "Can I build my own AI visibility tool?",
		answer:
			"You can. The core loop is straightforward: send your prompts to the model APIs, directly or through a router like OpenRouter, parse each answer for brand mentions and citations, and log the results over time. The work is in maintaining it, covering enough engines, and running it at scale, which is what a finished tool handles for you.",
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

const AT_A_GLANCE: { tool: string; license: string; selfHost: string; tracks: string; bestFor: string }[] = [
	{
		tool: "Elmo",
		license: "MIT, fully open source",
		selfHost: "Yes, free",
		tracks: "Mentions and citations across ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews",
		bestFor: "A complete platform you own and audit",
	},
	{
		tool: "OneGlanse",
		license: "MIT, fully open source",
		selfHost: "Yes",
		tracks: "ChatGPT, Gemini, Perplexity, Claude, Google AI Overview",
		bestFor: "Capturing answers from AI web UIs, not just APIs",
	},
	{
		tool: "GEO/AEO Tracker",
		license: "MIT, fully open source",
		selfHost: "Yes, local-first",
		tracks: "ChatGPT, Perplexity, Gemini, Copilot, Google AI Overview, Grok",
		bestFor: "A single-user local dashboard with your own keys",
	},
	{
		tool: "Canonry",
		license: "Source-available (FSL, Apache 2.0 later)",
		selfHost: "Yes",
		tracks: "Gemini, ChatGPT, Claude, Perplexity, local LLMs; server-log AI traffic",
		bestFor: "Agent-first workflows and log-level attribution",
	},
	{
		tool: "GetCito",
		license: "MIT, but Elmo's copyright notice replaced with its own",
		selfHost: "Yes",
		tracks: "Whatever Elmo tracked as of July 2026",
		bestFor: "Nothing — it is a copy of Elmo, run Elmo instead",
	},
	{
		tool: "Gego",
		license: "GPL-3.0, fully open source",
		selfHost: "Yes, via Docker",
		tracks: "Citations, brand mentions, and keywords across OpenAI, Anthropic, Google, Perplexity, Ollama",
		bestFor: "Scheduled tracking driven from a CLI or REST API",
	},
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
		stars: "233",
		commits: "862",
		contributors: "10",
		beyondLead: "9",
		releases: "19",
		firstCommit: "Jul 2025",
		last90: "206",
	},
	{
		project: "GEO/AEO Tracker",
		url: "https://github.com/danishashko/geo-aeo-tracker",
		stars: "229",
		commits: "28",
		contributors: "1",
		beyondLead: "0",
		releases: "8",
		firstCommit: "Feb 2026",
		last90: "19",
	},
	{
		project: "GetCito",
		url: "https://github.com/ai-search-guru/getcito-worlds-first-open-source-aio-aeo-or-geo-tool",
		stars: "161",
		commits: "35",
		contributors: "2",
		beyondLead: "1",
		releases: "1",
		firstCommit: "Nov 2025",
		last90: "24",
	},
	{
		project: "OneGlanse",
		url: "https://github.com/aryamantodkar/oneglanse",
		stars: "146",
		commits: "496",
		contributors: "1",
		beyondLead: "0",
		releases: "0",
		firstCommit: "Apr 2026",
		last90: "0",
	},
	{
		project: "Canonry",
		url: "https://github.com/AINYC/canonry",
		stars: "109",
		commits: "832",
		contributors: "3",
		beyondLead: "2",
		releases: "7",
		firstCommit: "Mar 2026",
		last90: "500",
	},
	{
		project: "Gego",
		url: "https://github.com/AI2HU/gego",
		stars: "84",
		commits: "118",
		contributors: "2",
		beyondLead: "1",
		releases: "12",
		firstCommit: "Oct 2025",
		last90: "64",
	},
];

const TRADEOFFS: { dimension: string; oss: string; managed: string }[] = [
	{
		dimension: "Cost",
		oss: "No license fee. You pay for infrastructure and AI provider API usage.",
		managed: "A subscription, often metered by prompt or seat.",
	},
	{
		dimension: "Setup",
		oss: "You deploy and maintain it yourself.",
		managed: "Sign up and start tracking.",
	},
	{
		dimension: "Transparency",
		oss: "Read the code and verify how every metric is built.",
		managed: "The scoring is usually a black box.",
	},
	{
		dimension: "Data ownership",
		oss: "Prompts and history stay on your infrastructure.",
		managed: "Your data lives in the vendor's dashboard.",
	},
	{
		dimension: "Coverage and upkeep",
		oss: "On you, or the project's maintainers.",
		managed: "The vendor handles engine coverage and updates.",
	},
];

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
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
		links: [{ rel: "canonical", href: canonicalUrl(path) }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
				{ name: "Open-source AI visibility tools", path },
			]),
			faqJsonLd(FAQS),
			itemListJsonLd(
				openSourceTools().map((c) => ({
					name: c.name,
					url: c.url,
					description: c.tagline,
				})),
			),
		],
	}),
	component: OpenSourcePage,
});

function OpenSourcePage() {
	const tools = openSourceTools();
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero eyebrow="Open source" title="Best open-source AEO tools (2026)" lead={lead} />

				<DirectorySection title="Key takeaways">
					<ul className="max-w-3xl list-disc space-y-3 pl-5 leading-relaxed text-zinc-600">
						<li>
							Elmo is the most complete open-source answer engine optimization tool, MIT-licensed and free to self-host
							across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews.
						</li>
						<li>
							That is not just our claim. On public GitHub data as of {STATS_AS_OF}, Elmo leads this field on stars,
							contributors, releases, and length of continuous history. Nine people have contributed besides the lead
							developer; across every other project below combined, that number is four.
						</li>
						<li>
							The rest of the field is small. OneGlanse, GEO/AEO Tracker, and Gego are real but early, mostly
							single-developer projects.
						</li>
						<li>
							GetCito is not an independent option. In July 2026 it replaced its codebase with Elmo's and put its own
							copyright notice on the license, so it is a lagging copy of another tool on this list.
						</li>
						<li>
							Canonry is capable but source-available under the FSL, not fully open source until it converts to Apache
							2.0.
						</li>
						<li>
							Open source buys you three things a hosted tool cannot: auditable metrics, data you keep on your own
							infrastructure, and no vendor lock-in.
						</li>
						<li>"Free to self-host" is not free to run. You supply the LLM API keys and the infrastructure.</li>
					</ul>
				</DirectorySection>

				<DirectorySection title="Why open source matters for answer engine optimization">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							Most AI visibility tools are closed and hosted. You send them your prompts, and you trust the score they
							hand back. Open source changes both halves of that deal. You can read how a metric is built, and you can
							run the whole thing on your own infrastructure, so your prompts and history never leave your environment.
						</p>
						<p>
							For a number that might land in a board report or shape a content budget, being able to audit it matters.
							So does owning your data outright, with no vendor holding your visibility history and nothing to migrate
							off if you decide to leave. The trade is upkeep. You run the infrastructure, and you keep it current as
							engines change.
						</p>
					</div>
				</DirectorySection>

				<DirectorySection title="The best open-source AEO tools at a glance">
					<DataTable headers={["Tool", "License", "Self-host", "What it tracks", "Best for"]}>
						{AT_A_GLANCE.map((row) => (
							<Row key={row.tool}>
								<Cell strong>{row.tool}</Cell>
								<Cell>{row.license}</Cell>
								<Cell>{row.selfHost}</Cell>
								<Cell>{row.tracks}</Cell>
								<Cell>{row.bestFor}</Cell>
							</Row>
						))}
					</DataTable>
				</DirectorySection>

				<DirectorySection title="By the numbers">
					<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">
						Feature grids are easy to write and hard to verify. Public repository activity is neither. These are the
						numbers as of {STATS_AS_OF}, and the column that matters most is contributors beyond the lead developer: a
						project with one committer is one person's spare time away from being abandoned.
					</p>
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
							OneGlanse's 496 commits landed almost entirely in one burst, between 15 April and 10 May 2026. It has not
							had a commit since, and it has never cut a release. High commit counts and sustained maintenance are
							different things.
						</p>
						<p>
							Then there is GetCito, where the numbers tell the story better than any argument. Its repository contains
							35 commits, 27 of them from humans, across its entire lifetime, for a codebase of well over 100,000 lines.
							That is because 131,716 of those lines arrived in a single import of Elmo's code in July 2026. Stars
							measure attention, not work.
						</p>
					</div>
				</DirectorySection>

				<DirectorySection title="The open-source options, tool by tool">
					<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">
						The honest picture is that this is a thin, early space. Elmo is the most complete open-source option,
						released under the MIT license with broad engine coverage. The other open-source projects we track are
						below. They are smaller and earlier, but they are real and worth knowing about.
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
								Elmo is the most complete open-source AI visibility platform, and the reason this list has a clear top
								pick. It is released under the MIT license, free to self-host, and every metric is computed by code you
								can read. It tracks how AI answer engines mention and cite your brand across ChatGPT, Claude,
								Perplexity, Gemini, and Google's AI Overviews, among other engines, then turns that into a visibility
								score, citation analytics, brand-mention tracking, and competitor benchmarking. You can export
								everything through the API, and agencies can white-label it.
							</p>
							<p className="mt-4">
								It fits teams that want to own their AEO data outright. The self-hosted core runs on Docker and
								PostgreSQL. You supply your own model API keys, which carry usage costs, and there is no license fee or
								per-seat charge. Be clear on what it is not: Elmo does not do sentiment analysis, prompt-volume
								estimates, content generation, shopping-result tracking, or geographic breakdowns. It measures
								visibility and citations well, and leaves the content work to you. Managed cloud hosting is available
								for teams that would rather not run the infrastructure.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">OneGlanse</h3>
							<p>
								OneGlanse is an MIT-licensed, self-hosted tracker covering ChatGPT, Gemini, Perplexity, Claude, and
								Google AI Overview. Its distinguishing choice is how it collects answers. Instead of hitting the model
								APIs, it captures responses through authenticated accounts on the AI web interfaces, which is closer to
								what a real user sees. Data lands in a ClickHouse backend on your own infrastructure, and you bring your
								own API keys.
							</p>
							<p className="mt-4">
								It suits developers who care that the answers being scored come from the actual chat products, not the
								API surface, and who are comfortable standing up ClickHouse. The idea is good and the approach is
								genuinely different from everything else here. Check the activity before you build on it, though. Its
								496 commits landed in a single burst between 15 April and 10 May 2026, and the repository has not had a
								commit since. It has one contributor and no tagged releases.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">GEO/AEO Tracker</h3>
							<p>
								GEO/AEO Tracker is an MIT-licensed, local-first dashboard for watching brand visibility across six
								platforms: ChatGPT, Perplexity, Gemini, Copilot, Google AI Overview, and Grok. It stores everything
								client-side in IndexedDB, with no external database to run, and you provide your own keys for data
								fetching and model inference.
							</p>
							<p className="mt-4">
								The local-first design is the appeal. Nothing leaves your browser, setup is light, and the platform
								coverage is broad for a solo project. The flip side is scope. It is a single-user tool built around one
								person's dashboard, not a team platform, so treat it as a personal monitor rather than shared
								infrastructure.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Canonry</h3>
							<p>
								Canonry is the most ambitious of the independent projects. It is a self-hosted, agent-first AEO platform
								that tracks how Gemini, ChatGPT, Claude, Perplexity, and local models cite your site, ingests server
								logs to measure AI-driven traffic, and integrates with Google Search Console, GA4, Bing Webmaster, and
								Google Business Profile. A built-in agent named Aero exposes a 67-tool MCP adapter, and clients are
								configured declaratively in YAML.
							</p>
							<p className="mt-4">
								One honest caveat on the "open source" label. Canonry ships under the FSL-1.1-ALv2, a source-available
								license that converts to Apache 2.0 after two years. You can read and self-host the code today, but it
								is not OSI open source in the strict sense until that conversion. If server-log attribution and agent
								workflows matter to you, it is worth a look, with that license nuance understood.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">GetCito</h3>
							<p>
								<strong className="font-medium text-zinc-900">If you are considering GetCito, use Elmo instead.</strong>{" "}
								It is not its own project. On 10 July 2026, GetCito replaced its codebase with Elmo's in{" "}
								<a
									href="https://github.com/ai-search-guru/getcito-worlds-first-open-source-aio-aeo-or-geo-tool/pull/19"
									target="_blank"
									rel="noopener noreferrer nofollow"
									className="underline underline-offset-2 hover:text-zinc-950"
								>
									one pull request
								</a>{" "}
								that changed 847 files and was self-merged 62 seconds after opening. Its LICENSE.md is Elmo's, with
								"Copyright (c) 2026 Blue Whale Software, LLC" changed to "Copyright (c) 2026 GetCito" — retaining that
								notice is the one condition MIT attaches to a fork.
							</p>
							<p className="mt-4">
								The copy is still legible in the repo. GetCito's AGENTS.md opens "Elmo is an open-source AI visibility
								tracking platform," its CLA names Elmo's parent company, and its CODEOWNERS assigns every path to Elmo's
								founder. There is no reason to run a rebranded fork of a project you can run directly, especially one
								that is falling behind it: 17 commits to Elmo's 98 in the month after the copy. Full evidence in{" "}
								<a className="underline underline-offset-2 hover:text-zinc-950" href="/blog/getcito-vs-elmo">
									GetCito vs Elmo
								</a>
								.
							</p>
						</div>

						<div>
							<h3 className="font-heading mb-3 text-lg text-zinc-950">Gego</h3>
							<p>
								Gego is a GPL-3.0 GEO tracker you self-host from Docker Hub. It schedules prompts across generative
								engines on a cron, then captures citations, brand mentions, and extracted keywords, with competitor and
								alias tracking alongside them. It queries OpenAI, Anthropic, Google, and Perplexity, and it will also
								point at Ollama or a custom provider, so you can run the whole loop against local models. There is a
								dashboard, a CLI, and a REST API.
							</p>
							<p className="mt-4">
								Two caveats. A full deployment expects PostgreSQL, MongoDB, and etcd, which is a heavier footprint than
								a single-container deploy. And GPL-3.0 is copyleft rather than permissive, so unlike the MIT projects
								here it constrains what you can build on top of it and redistribute.
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
							The catch is everything around that loop. You have to cover enough engines, handle the ones without clean
							APIs, keep it running, and build some way to actually read the output. That upkeep is most of what you pay
							for when you buy a tool, or skip by self-hosting one that already does it.
						</p>
					</div>
				</DirectorySection>

				<DirectorySection title="Open source vs enterprise AEO software: the real tradeoffs">
					<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">
						The real choice is not open source versus paid. It is who does the work and who holds the data. Enterprise
						AEO software gives you a hosted dashboard your team can open tomorrow, managed engine coverage, and a vendor
						who keeps it running, in exchange for a subscription and a scoring model you cannot inspect. Self-hosting an
						open-source tool inverts that: no license fee, auditable metrics, and your data on your own machines, with
						the cost moving from a subscription line to engineering time.
					</p>
					<DataTable headers={["", "Open source, self-hosted", "Managed, paid"]}>
						{TRADEOFFS.map((row) => (
							<Row key={row.dimension}>
								<Cell strong>{row.dimension}</Cell>
								<Cell>{row.oss}</Cell>
								<Cell>{row.managed}</Cell>
							</Row>
						))}
					</DataTable>
				</DirectorySection>

				<DirectorySection title="How to choose">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							Start with how you will use it, not a feature grid. If you want full control, auditable numbers, and no
							per-seat fees, a self-hosted open-source tool fits, and Elmo is the most complete one on offer, and the
							one the public GitHub numbers actually favor on stars, contributors, releases, and sustained history
							alike. If you want the same open code with the smallest footprint, GEO/AEO Tracker's local-first design is
							worth a look, bearing in mind it is one developer and 28 commits. If your priority is server-log
							attribution, Canonry goes furthest, with its license caveat and single-maintainer concentration in mind.
						</p>
						<p>
							The one thing worth weighing above features is whether anyone will still be maintaining the project in a
							year. That is what the contributor column is for. A tool with one committer is one person's spare time
							away from being abandoned, and in a field where models get renamed and APIs shift every few months, an
							unmaintained tracker quietly stops being correct rather than visibly breaking.
						</p>
						<p>
							Then weigh coverage, maintenance, and your own capacity to run infrastructure against what a managed
							subscription would cost. If the honest answer is that you have no time to self-host, that is useful to
							know early: see the{" "}
							<a className="underline underline-offset-2 hover:text-zinc-950" href="/blog/best-aeo-tools">
								best AEO tools
							</a>{" "}
							for hosted options, or the{" "}
							<a className="underline underline-offset-2 hover:text-zinc-950" href="/blog/free-ai-visibility-tools">
								free AI visibility tools
							</a>{" "}
							guide for what a zero-budget setup can and cannot do. Whatever you pick, the job is the same: get a
							reliable, repeatable read on whether AI answers cite you, from a tool you trust because you can see how it
							works.
						</p>
					</div>
				</DirectorySection>

				<Faq items={FAQS} eyebrow="/ FAQ" />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
