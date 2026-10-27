import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Link2, ListChecks, MessageSquareText, Users } from "lucide-react";
import { CheckerTool } from "@/components/checker/checker-tool";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { Faq } from "@/components/home/faq";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { SectionHeading } from "@/components/home/ui";
import { Navbar } from "@/components/navbar";
import { SCORE_WEIGHTS } from "@/lib/checker/score";
import { CHECKER_FAQS } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta, webApplicationJsonLd } from "@/lib/seo";

const PATH = "/tools/ai-visibility-checker";
const title = "Free AI Visibility Checker: Does ChatGPT Recommend You? · Elmo";
const description =
	"Check your AI visibility score free. See if ChatGPT mentions your brand for real buyer questions, who it recommends instead, which sources it cites, and if AI crawlers can reach your site.";

export const Route = createFileRoute("/tools/ai-visibility-checker")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: PATH, label: "Free tool" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl(PATH) }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Free tools", path: "/tools" },
				{ name: "AI Visibility Checker", path: PATH },
			]),
			webApplicationJsonLd({ name: "AI Visibility Checker", description, path: PATH }),
			faqJsonLd(CHECKER_FAQS),
		],
	}),
	component: CheckerPage,
});

const CHECKS = [
	{
		icon: MessageSquareText,
		title: "Brand mentions in ChatGPT",
		body: "Five unbranded buyer questions for your category, asked with web search on. Are you named, and how high?",
	},
	{
		icon: Users,
		title: "Who AI recommends instead",
		body: "The competitors named in the same answers, ranked by how often they show up where you don't.",
	},
	{
		icon: Link2,
		title: "Sources AI cites",
		body: "The review sites, forums, and articles the answers lean on, and whether your own site is one of them.",
	},
	{
		icon: Bot,
		title: "AI crawler access",
		body: "Your robots.txt rules for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, and more.",
	},
	{
		icon: ListChecks,
		title: "Structured data and llms.txt",
		body: "Whether your homepage declares who you are in JSON-LD, and whether you publish an llms.txt.",
	},
];

const SCORE_ROWS: { key: keyof typeof SCORE_WEIGHTS; label: string; why: string }[] = [
	{
		key: "mentions",
		label: "Mentioned in AI answers",
		why: "The outcome that matters: share of answers that name your brand.",
	},
	{
		key: "position",
		label: "Position when mentioned",
		why: "Named first is worth more than named fourth in a list of ten.",
	},
	{
		key: "citations",
		label: "Your site cited as a source",
		why: "A link back to your pages is where AI search traffic comes from.",
	},
	{
		key: "crawlers",
		label: "AI crawler access",
		why: "Search crawlers count double: blocking them stops citations today.",
	},
	{
		key: "structured-data",
		label: "Structured data",
		why: "JSON-LD helps engines tie your name, site, and products together.",
	},
	{ key: "llms-txt", label: "llms.txt", why: "A small signal for AI agents; nice to have, not decisive." },
];

const IMPROVE_STEPS = [
	{
		title: "Unblock the AI search crawlers",
		body: "Allow OAI-SearchBot, ChatGPT-User, Claude-SearchBot, and PerplexityBot in robots.txt. You can still block training crawlers like GPTBot if you prefer.",
		link: { href: "/blog/robots-txt-ai-crawlers", text: "Robots.txt for AI crawlers" },
	},
	{
		title: "Answer the questions buyers ask",
		body: "Publish clear pages for the prompts in your report: who you're for, how you compare, what you cost. Engines quote pages that answer directly.",
		link: { href: "/answer-engine-optimization", text: "The AEO guide" },
	},
	{
		title: "Get mentioned where AI looks",
		body: "The sources in your report are the sites AI trusts for your category. Reviews, community threads, and comparison articles there move answers.",
		link: { href: "/blog/where-ai-citations-come-from", text: "Where AI citations come from" },
	},
	{
		title: "Measure it over time",
		body: "One run is a snapshot. Track a fixed set of prompts across engines every day to see what actually changes your visibility.",
		link: { href: "/features", text: "How Elmo tracks it" },
	},
];

const RELATED = [
	{ href: "/answer-engine-optimization", text: "What is answer engine optimization (AEO)?" },
	{ href: "/blog/free-ai-visibility-tools", text: "Free AI visibility tools compared" },
	{ href: "/blog/best-ai-visibility-tools", text: "The best AI visibility tools" },
	{ href: "/ai-visibility-tools", text: "AI visibility tool directory" },
	{ href: "/blog/why-ai-visibility-scores-differ", text: "Why AI visibility scores differ between tools" },
	{ href: "/pricing", text: "Elmo Cloud pricing" },
];

const LINK = "font-medium text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-950";

function CheckerPage() {
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-zinc-50/40`}>
			<HomeStyles />
			<Navbar />
			<main>
				<section className="relative border-b border-zinc-200 bg-white">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
					/>
					<div className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 md:px-6 lg:pt-20 lg:pb-20">
						<nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
							<Link to="/tools" className="hover:text-zinc-950">
								Free tools
							</Link>
							<span className="mx-2 text-zinc-300">/</span>
							<span className="text-zinc-700">AI Visibility Checker</span>
						</nav>
						<h1 className="mt-4 max-w-[22ch] text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance text-zinc-950 sm:text-6xl">
							Free AI Visibility Checker
						</h1>
						<p className="mt-5 max-w-[62ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
							Does ChatGPT recommend your brand? Enter your website to get an AI visibility score in about a minute: the
							questions your buyers ask, whether AI names you, who it recommends instead, which sources it cites, and
							whether AI crawlers can reach your site.
						</p>
						<div className="mt-8">
							<CheckerTool />
						</div>
					</div>
				</section>

				<section className="border-b border-zinc-200 bg-white">
					<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
						<SectionHeading
							title="What the AI visibility checker tests"
							lede="AI visibility is how often AI answer engines mention, recommend, and cite your brand when people ask about your category. This free audit looks at the answers themselves and the technical basics behind them."
						/>
						<div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
							{CHECKS.map((check) => (
								<div key={check.title} className="bg-white p-6">
									<span className="inline-flex size-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
										<check.icon className="size-4" strokeWidth={2.25} aria-hidden="true" />
									</span>
									<h3 className="mt-4 text-base font-semibold tracking-tight text-zinc-950">{check.title}</h3>
									<p className="mt-1.5 text-pretty text-sm/6 text-zinc-600">{check.body}</p>
								</div>
							))}
							<div className="flex flex-col justify-center bg-zinc-950 p-6 text-white">
								<h3 className="text-base font-semibold tracking-tight">Need more than one snapshot?</h3>
								<p className="mt-1.5 text-pretty text-sm/6 text-zinc-300">
									Elmo tracks hundreds of prompts across ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews
									every day.
								</p>
								<Link
									to="/pricing"
									className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-blue-200"
								>
									See plans
									<ArrowRight className="size-3.5" aria-hidden="true" />
								</Link>
							</div>
						</div>
					</div>
				</section>

				<section className="border-b border-zinc-200 bg-white">
					<div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:px-6 lg:grid-cols-12 lg:py-24">
						<div className="lg:col-span-5">
							<SectionHeading
								title="How your AI visibility score works"
								lede="A 0–100 score with nothing hidden. Most of it comes from what AI actually said about you; the rest from whether AI can read your site."
							/>
							<p className="mt-4 max-w-[56ch] text-pretty text-sm/6 text-zinc-600">
								Scores from different tools rarely match, because the prompts and weights define what a score measures.{" "}
								<a href="/blog/why-ai-visibility-scores-differ" className={LINK}>
									Here's why
								</a>
								.
							</p>
						</div>
						<div className="lg:col-span-7">
							<table className="w-full text-left text-sm">
								<thead>
									<tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
										<th scope="col" className="py-2 pr-4 font-medium">
											Component
										</th>
										<th scope="col" className="py-2 pr-4 font-medium">
											Points
										</th>
										<th scope="col" className="py-2 font-medium">
											Why it counts
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-zinc-100 align-top">
									{SCORE_ROWS.map((row) => (
										<tr key={row.key}>
											<td className="py-3 pr-4 font-medium text-zinc-950">{row.label}</td>
											<td className="py-3 pr-4 tabular-nums text-zinc-700">{SCORE_WEIGHTS[row.key]}</td>
											<td className="py-3 text-pretty text-zinc-600">{row.why}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</section>

				<section className="border-b border-zinc-200 bg-white">
					<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
						<SectionHeading
							title="How to improve your AI visibility"
							lede="Your report shows where you stand. These are the levers that move it."
						/>
						<ol className="mt-12 grid gap-6 md:grid-cols-2">
							{IMPROVE_STEPS.map((step, index) => (
								<li key={step.title} className="flex gap-4">
									<span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
										{index + 1}
									</span>
									<div>
										<h3 className="text-base font-semibold tracking-tight text-zinc-950">{step.title}</h3>
										<p className="mt-1.5 max-w-[52ch] text-pretty text-sm/6 text-zinc-600">{step.body}</p>
										<a href={step.link.href} className={`mt-2 inline-block text-sm ${LINK}`}>
											{step.link.text}
										</a>
									</div>
								</li>
							))}
						</ol>

						<div className="mt-16 rounded-lg border border-zinc-200 bg-zinc-50 p-6 lg:p-8">
							<h2 className="text-lg font-semibold tracking-tight text-zinc-950">Related reading</h2>
							<ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
								{RELATED.map((item) => (
									<li key={item.href}>
										<a href={item.href} className={`text-sm ${LINK}`}>
											{item.text}
										</a>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				<Faq items={CHECKER_FAQS} />
				<Closing from="marketing-checker" />
			</main>
			<Footer />
		</div>
	);
}
