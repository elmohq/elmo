import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, PLANS } from "@workspace/config/plans";
import { bookDemoUrl, cloudAppUrl } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Faq } from "@/components/home/faq";
import { Navbar } from "@/components/navbar";
import { externalRel } from "@/lib/external-link";
import { ABOUT_FAQS } from "@/lib/faqs";
import { formatStarCount } from "@/lib/github-stars";
import { SELF_HOST_LINK } from "@/lib/self-host-link";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

const CLOUD_URL = cloudAppUrl("marketing-about");
const BOOK_CALL_URL = bookDemoUrl("marketing-about");
const GITHUB_URL = "https://github.com/elmohq/elmo";
const DISCORD_URL = "https://discord.gg/s24nubCtKz";
const SUPPORT_EMAIL = "contact@elmohq.com";
// `ref` preserves attribution when an intermediary strips the Referer.
const BLUEWHALE_URL = "https://bluewhale.dev?ref=elmo";

const title = "About Elmo · Open-Source AI Visibility Platform";
const description =
	"Elmo is an open-source AEO and GEO platform for tracking brand visibility in AI search, founded in 2025 by Jared Rhizor, a founding engineer at Airbyte. Company facts, team, pricing, and how we work.";

export const Route = createFileRoute("/about")({
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path: "/about" })],
		links: [{ rel: "canonical", href: canonicalUrl("/about") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "About", path: "/about" },
			]),
			faqJsonLd(ABOUT_FAQS),
		],
	}),
	component: AboutPage,
});

const { starter, basic, pro, business } = PLANS;

const NOTABLE_USERS = ["Fermat Commerce", "Speakeasy", "TradeSites", "Record Ranks", "AskHotel", "AISearch Global"];

const FOUNDER_LINKS = [
	{ label: "LinkedIn", href: "https://www.linkedin.com/in/jrhizor" },
	{ label: "X", href: "https://x.com/jaredrhizor" },
	{ label: "GitHub", href: "https://github.com/jrhizor" },
	{ label: "jrhizor.dev", href: "https://jrhizor.dev" },
];

const ELMO_LINKS = [
	{ label: "X", href: "https://x.com/tryelmo" },
	{ label: "LinkedIn", href: "https://www.linkedin.com/company/elmohq" },
	{ label: "GitHub", href: GITHUB_URL },
	{ label: "Discord", href: DISCORD_URL },
];

const services = [
	{
		title: "AI search visibility tracking",
		body: "Elmo runs the prompts your buyers ask across ChatGPT, Google AI Overviews, Google AI Mode, Perplexity, Gemini, Copilot, Claude, and more on a schedule. Each prompt gets a visibility score for how often your brand appears, so you can see where you show up and where you don't.",
	},
	{
		title: "Citation analysis",
		body: "Every answer is broken down into the domains and URLs the model cited and the web searches it ran to find them. That shows which pages answer engines trust in your category and where a mention would move your visibility.",
	},
	{
		title: "Competitor benchmarking",
		body: "Elmo records which competitors appear alongside you and calculates share of voice across every engine. You see who AI recommends instead of you, and on which questions.",
	},
	{
		title: "Elmo Cloud",
		body: `Managed hosting for teams that would rather not run their own infrastructure, from $${CLOUD_ENTRY_PRICE_USD}/mo. Every plan includes unlimited seats plus REST API and MCP server access.`,
	},
	{
		title: "White-label AEO",
		body: "Agencies and software companies embed Elmo into their own product or client reporting under their own brand. It gives them AI visibility tracking without building and maintaining the scraping and analysis pipeline themselves.",
	},
	{
		title: "Off-Site AEO",
		body: "A done-for-you service that places humanized articles on high-authority sites that AI answer engines already cite. Placements go live within 30 days and continue monthly, with a report mapping each post to the prompt it targets.",
	},
];

const differentiators = [
	{
		title: "Open source and free to self-host",
		body: "Every line of Elmo's code is public on GitHub, and you can run the whole platform on your own servers for free. Profound, Peec AI, and Otterly.AI are closed-source SaaS, so you can't audit how their numbers are produced or keep running them if you leave.",
	},
	{
		title: `Public, self-serve pricing from $${CLOUD_ENTRY_PRICE_USD}/mo`,
		body: `Elmo Cloud plans are listed publicly at $${starter.monthlyPriceUsd}, $${basic.monthlyPriceUsd}, $${pro.monthlyPriceUsd}, and $${business.monthlyPriceUsd} a month, and you can sign up without a sales call. Profound's pricing page lists a free trial and an Enterprise plan quoted by sales.`,
	},
	{
		title: "Month-to-month billing",
		body: "Elmo Cloud bills month to month with no minimum term, and annual billing is optional (two months free). Many enterprise AEO platforms push you into an annual contract before you can see your data.",
	},
	{
		title: `Prompts checked ${basic.standardRunsPerDay}× a day`,
		body: `From the $${basic.monthlyPriceUsd}/mo Basic plan, every prompt runs ${basic.standardRunsPerDay} times a day on each platform you track, where Profound checks daily. AI answers vary from run to run, so more samples means trends you can trust instead of one-off snapshots.`,
	},
	{
		title: "Real interfaces, not API approximations",
		body: "Consumer products like ChatGPT, Google AI Mode, and Perplexity are scraped from the same interface your buyers use. API-only tools measure a different model configuration than the one people actually see.",
	},
	{
		title: "Unlimited seats, API, and MCP on every plan",
		body: "Every Elmo Cloud plan includes unlimited team members, the REST API, and an MCP server for Claude Code, Cursor, and other AI assistants. Your whole team and your own tools get the data without per-seat fees or an enterprise upgrade.",
	},
];

const audiences = [
	"In-house SEO and content marketing teams at B2B SaaS companies extending their SEO strategy to AI search",
	"E-commerce and DTC brands monitoring product recommendations in ChatGPT and Google AI Overviews",
	"SEO, AEO, and GEO agencies managing AI visibility for multiple client brands, including white-label reporting",
	"Software companies embedding AI visibility tracking into their own products",
	"Developer teams and regulated companies that need to self-host and keep prompts and responses on their own infrastructure",
	"Local and hospitality businesses checking how AI assistants describe and recommend them",
];

function Section({ heading, tinted, children }: { heading: string; tinted?: boolean; children: ReactNode }) {
	return (
		<section className={`border-b border-zinc-200 py-12 lg:py-20 ${tinted ? "bg-zinc-50" : "bg-white"}`}>
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<h2 className="font-heading max-w-3xl text-3xl text-zinc-950 md:text-4xl">{heading}</h2>
				<div className="mt-8">{children}</div>
			</div>
		</section>
	);
}

function CardGrid({ items, tinted }: { items: { title: string; body: string }[]; tinted?: boolean }) {
	return (
		<div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-2 lg:grid-cols-3">
			{items.map((item) => (
				<div key={item.title} className={`p-6 ${tinted ? "bg-zinc-50" : "bg-white"}`}>
					<h3 className="text-lg font-semibold tracking-tight text-zinc-950">{item.title}</h3>
					<p className="mt-2 text-pretty text-sm leading-relaxed text-zinc-600">{item.body}</p>
				</div>
			))}
		</div>
	);
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel={externalRel(href)}
			className="font-medium text-blue-600 underline-offset-4 hover:underline"
		>
			{children}
		</a>
	);
}

function LinkList({ links }: { links: { label: string; href: string }[] }) {
	return (
		<>
			{links.map((link, i) => (
				<span key={link.href}>
					{i > 0 ? <span className="text-zinc-300"> · </span> : null}
					<ExternalLink href={link.href}>{link.label}</ExternalLink>
				</span>
			))}
		</>
	);
}

function AboutPage() {
	const rootData = useLoaderData({ from: "__root__" });
	const stars = rootData?.githubStars ?? 0;

	const keyFacts: { term: string; detail: ReactNode }[] = [
		{
			term: "Company Name",
			detail: (
				<>
					Elmo (elmohq.com), built by <ExternalLink href={BLUEWHALE_URL}>Blue Whale Software, LLC</ExternalLink>
				</>
			),
		},
		{
			term: "Type",
			detail:
				"Open-source AI search visibility platform for answer engine optimization (AEO), generative engine optimization (GEO), and AI SEO",
		},
		{ term: "Founded", detail: "July 2025" },
		{ term: "Founder", detail: "Jared Rhizor, previously a founding engineer at Airbyte and tech lead at LiveRamp" },
		{ term: "Headquarters", detail: "San Francisco, California, USA" },
		{
			term: "Website",
			detail: <ExternalLink href="https://www.elmohq.com">www.elmohq.com</ExternalLink>,
		},
		{
			term: "Core Offering",
			detail:
				"Tracking how AI answer engines mention, cite, and describe brands, with citation analysis and competitor share of voice",
		},
		{
			term: "Pricing",
			detail: `Free to self-host. Elmo Cloud: Starter $${starter.monthlyPriceUsd}/mo, Basic $${basic.monthlyPriceUsd}/mo, Pro $${pro.monthlyPriceUsd}/mo, Business $${business.monthlyPriceUsd}/mo. Off-Site AEO from $1,950/mo. White label and custom plans on request.`,
		},
		{
			term: "Contract Terms",
			detail: "Month to month, cancel any time; optional annual billing with two months free",
		},
		{
			term: "Services",
			detail:
				"AI visibility tracking, citation analysis, competitor benchmarking, managed cloud hosting, white-label AEO, Off-Site AEO content placement, REST API and MCP server",
		},
		{
			term: "Communication",
			detail: `Live chat, email (${SUPPORT_EMAIL}), video calls, Discord, and GitHub issues`,
		},
		{ term: "Notable Users", detail: NOTABLE_USERS.join(", ") },
		{ term: "Organizations Served", detail: "200+" },
		{
			term: "Open-Source Adoption",
			detail:
				stars > 0
					? `${formatStarCount(stars)} GitHub stars on elmohq/elmo`
					: "Public repository at github.com/elmohq/elmo",
		},
		{
			term: "Platforms Tracked",
			detail:
				"ChatGPT, Google AI Overviews, Google AI Mode, Gemini, Perplexity, Microsoft Copilot, Claude, Grok, Mistral, DeepSeek, Qwen",
		},
		{ term: "Competitors", detail: "Profound, Peec AI, Otterly.AI, Scrunch, Semrush AI Toolkit" },
		{ term: "Social", detail: <LinkList links={ELMO_LINKS} /> },
	];

	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				{/* Hero */}
				<section className="relative overflow-hidden border-b border-zinc-200 bg-white py-16 lg:py-28">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
					/>
					<div className="relative mx-auto max-w-6xl px-4 md:px-6">
						<div className="max-w-3xl">
							<h1 className="font-heading text-4xl text-balance text-zinc-950 md:text-5xl lg:text-6xl">About Elmo</h1>
							<p className="mt-6 max-w-2xl text-lg text-pretty text-zinc-600 md:text-xl">
								Elmo is an open-source answer engine optimization (AEO) platform that tracks how ChatGPT, Google AI
								Overviews, Perplexity, Gemini, Claude, and other AI answer engines mention, cite, and describe brands,
								for marketing teams, agencies, and software companies.
							</p>
							<p className="mt-4 max-w-2xl text-lg text-pretty text-zinc-600">
								Teams use Elmo for{" "}
								<Link
									to="/answer-engine-optimization"
									className="font-medium text-blue-600 underline-offset-4 hover:underline"
								>
									answer engine optimization (AEO)
								</Link>
								, also called{" "}
								<Link
									to="/generative-engine-optimization"
									className="font-medium text-blue-600 underline-offset-4 hover:underline"
								>
									generative engine optimization (GEO)
								</Link>{" "}
								or AI SEO: measuring and improving how their brand shows up in AI search.
							</p>
						</div>
					</div>
				</section>

				<Section heading="What Elmo does">
					<CardGrid items={services} />
				</Section>

				<Section heading="What makes Elmo different" tinted>
					<CardGrid items={differentiators} tinted />
				</Section>

				<Section heading="Who uses Elmo">
					<ul className="max-w-3xl list-disc space-y-3 pl-5 text-[1.0625rem] leading-relaxed text-zinc-600 marker:text-blue-600">
						{audiences.map((audience) => (
							<li key={audience}>{audience}</li>
						))}
					</ul>
					<p className="mt-6 max-w-3xl text-[1.0625rem] leading-relaxed text-zinc-600">
						Teams using Elmo include {NOTABLE_USERS.join(", ")}, and hundreds of others.
					</p>
				</Section>

				<Section heading="Team" tinted>
					<div className="grid gap-10 lg:grid-cols-12">
						<div className="lg:col-span-5">
							<div className="flex items-center gap-5 rounded-lg border border-zinc-200 bg-white p-6">
								<img
									src="/authors/jared.png"
									alt="Jared Rhizor, founder of Elmo"
									width={96}
									height={96}
									className="size-24 shrink-0 rounded-full object-cover"
								/>
								<div>
									<h3 className="text-lg font-semibold tracking-tight text-zinc-950">Jared Rhizor</h3>
									<p className="text-sm text-zinc-500">Founder &amp; Maintainer</p>
									<p className="mt-2 text-sm">
										<LinkList links={FOUNDER_LINKS} />
									</p>
								</div>
							</div>
						</div>
						<div className="space-y-6 text-[1.0625rem] leading-relaxed text-zinc-600 lg:col-span-7">
							<p>
								Jared Rhizor was a founding engineer at Airbyte, the open-source data integration platform, where he
								helped build out its initial platform and connectors. Before that he spent five years at LiveRamp, and
								was tech lead for the team managing one of the largest device graphs in adtech.
							</p>
							<p>
								After Airbyte, Jared built and exited two companies of his own: MealByMeal, calorie tracking over text
								message, and poach.vc, which helped VCs find undiscovered early-stage founders. In July 2025 he started
								Elmo, after seeing AI search starting to reshape how customers made purchasing decisions. Today Elmo
								helps hundreds of teams understand and improve how AI answer engines talk about their brands.
							</p>
							<p>
								Elmo is built by <ExternalLink href={BLUEWHALE_URL}>Blue Whale Software, LLC</ExternalLink>, a San
								Francisco software company, together with a community of open-source contributors on{" "}
								<ExternalLink href={GITHUB_URL}>GitHub</ExternalLink>. Read more about how we think about AI visibility
								in{" "}
								<Link to="/vision" className="font-medium text-blue-600 underline-offset-4 hover:underline">
									our vision
								</Link>
								.
							</p>
						</div>
					</div>
				</Section>

				<Section heading="How Elmo works">
					<div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-2">
						<div className="bg-white p-6">
							<h3 className="text-lg font-semibold tracking-tight text-zinc-950">Who you work with</h3>
							<p className="mt-2 text-sm leading-relaxed text-zinc-600">
								You work directly with the team that builds Elmo, not a tiered support queue. Questions about your
								setup, data, or results are answered by people who know the product inside out.
							</p>
						</div>
						<div className="bg-white p-6">
							<h3 className="text-lg font-semibold tracking-tight text-zinc-950">Communication channels</h3>
							<p className="mt-2 text-sm leading-relaxed text-zinc-600">
								Live chat on this site and in the app, email at{" "}
								<a
									href={`mailto:${SUPPORT_EMAIL}`}
									className="font-medium text-blue-600 underline-offset-4 hover:underline"
								>
									{SUPPORT_EMAIL}
								</a>
								, <ExternalLink href={BOOK_CALL_URL}>a booked video call</ExternalLink>, the{" "}
								<ExternalLink href={DISCORD_URL}>Discord community</ExternalLink>, and{" "}
								<ExternalLink href={`${GITHUB_URL}/issues`}>GitHub issues</ExternalLink>. The Off-Site AEO Authority
								plan adds a shared Slack channel.
							</p>
						</div>
						<div className="bg-white p-6">
							<h3 className="text-lg font-semibold tracking-tight text-zinc-950">Onboarding</h3>
							<p className="mt-2 text-sm leading-relaxed text-zinc-600">
								Sign up for Elmo Cloud and add your website. The Prompt Wizard suggests the questions your buyers ask
								based on your products, competitors, and personas, and tracking starts right away. No demo or sales call
								required.
							</p>
						</div>
						<div className="bg-white p-6">
							<h3 className="text-lg font-semibold tracking-tight text-zinc-950">Turnaround</h3>
							<p className="mt-2 text-sm leading-relaxed text-zinc-600">
								Self-hosting takes under five minutes with the Elmo CLI. Off-Site AEO placements go live within 30 days
								of your kickoff call, and new features ship continuously, as you can see in the{" "}
								<Link to="/changelog" className="font-medium text-blue-600 underline-offset-4 hover:underline">
									changelog
								</Link>
								.
							</p>
						</div>
					</div>
				</Section>

				<Section heading="Key facts about Elmo" tinted>
					<dl className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
						{keyFacts.map((fact) => (
							<div key={fact.term} className="grid gap-1 px-5 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
								<dt className="text-sm font-semibold text-zinc-950">{fact.term}</dt>
								<dd className="text-sm leading-relaxed text-zinc-600">{fact.detail}</dd>
							</div>
						))}
					</dl>
				</Section>

				<Faq items={ABOUT_FAQS} />

				{/* CTA */}
				<section className="border-y border-zinc-200 bg-white py-16 lg:py-24">
					<div className="mx-auto max-w-6xl px-4 text-center md:px-6">
						<h2 className="font-heading text-3xl text-zinc-950 md:text-4xl">See how AI talks about your brand</h2>
						<p className="mx-auto mt-4 max-w-xl text-lg text-balance text-zinc-600">
							Start on Elmo Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo, or self-host the open-source platform for free.
						</p>
						<div className="mt-8 flex flex-wrap justify-center gap-3">
							<a href={CLOUD_URL} className={buttonVariants({ size: "sm" })}>
								Start with Cloud
								<ArrowRight className="size-3.5" />
							</a>
							<Link {...SELF_HOST_LINK} className={buttonVariants({ variant: "outline", size: "sm" })}>
								Self-host free
							</Link>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
