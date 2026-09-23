import { useLoaderData } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { bookDemoUrl } from "@workspace/config/referrals";
import {
	CUSTOMER_QUOTES,
	type CustomerQuote,
	FermatWordmark,
	SpeakeasyLockup,
	TradeSitesWordmark,
} from "@workspace/ui/brand/customers";
import { ArrowUpRight, Plus, Star } from "lucide-react";
import { externalRel } from "@/lib/external-link";
import type { FaqItem } from "@/lib/faqs";
import { formatStarCount } from "@/lib/github-stars";
import {
	AnthropicIcon,
	CopilotIcon,
	DeepSeekIcon,
	DiscordIcon,
	GeminiIcon,
	GitHubIcon,
	GoogleIcon,
	GrokIcon,
	MistralIcon,
	OpenAIIcon,
	PerplexityIcon,
} from "./icons";
import { Terminal } from "./terminal";
import { CloudCTA, Eyebrow, FOCUS_RING, QuietLink, SectionHeading, SelfHostCTA } from "./ui";

const DISCORD_INVITE_URL = "https://discord.gg/s24nubCtKz";
const GITHUB_URL = "https://github.com/elmohq/elmo";

// ---------------------------------------------------------------------------
// Customer logos
// ---------------------------------------------------------------------------

// Marks are recoloured to a single light tone so five different brand palettes
// read as one row on black; hover restores what each brand can show on dark.
const customers: { name: string; url: string; nofollow?: boolean; render: () => React.ReactNode }[] = [
	{
		name: "Fermat Commerce",
		url: "https://www.fermatcommerce.com/?ref=elmo",
		nofollow: true,
		render: () => <FermatWordmark className="h-5 sm:h-6" />,
	},
	{
		name: "Speakeasy",
		url: "https://www.speakeasy.com/?ref=elmo",
		render: () => <SpeakeasyLockup className="h-5 sm:h-6" />,
	},
	{
		name: "TradeSites",
		url: "https://www.tradesites.ai/?ref=elmo",
		render: () => (
			<TradeSitesWordmark className="h-5 px-2 sm:h-6 text-xs ring-1 ring-white/15 grayscale transition-[filter] group-hover:grayscale-0" />
		),
	},
	{
		name: "Record Ranks",
		url: "https://recordranks.com/?ref=elmo",
		render: () => <img src="/recordranks-logo.svg" alt="" className="block h-5 w-auto brightness-0 invert sm:h-6" />,
	},
	{
		name: "AskHotel",
		url: "https://askhotel.ai/?ref=elmo",
		render: () => <img src="/askhotel-logo.png" alt="" className="block h-5 w-auto brightness-0 invert sm:h-6" />,
	},
];

export function CustomerLogos() {
	return (
		<section aria-labelledby="customers-heading" className="border-y border-white/10 bg-zinc-950">
			<div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:gap-10 md:px-6">
				<h2
					id="customers-heading"
					className="shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500 md:w-28"
				>
					Trusted by
				</h2>
				<ul className="flex flex-1 flex-wrap items-center gap-x-7 gap-y-5 md:justify-between">
					{customers.map((c) => (
						<li key={c.name} className="flex items-center">
							<a
								href={c.url}
								target="_blank"
								rel={c.nofollow ? "nofollow noopener noreferrer" : "noopener noreferrer"}
								aria-label={c.name}
								className={`group flex h-8 items-center rounded text-zinc-300 opacity-70 transition-opacity hover:opacity-100 ${FOCUS_RING}`}
							>
								{c.render()}
							</a>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Model coverage
// ---------------------------------------------------------------------------

const models = [
	{ name: "ChatGPT", icon: OpenAIIcon },
	{ name: "Claude", icon: AnthropicIcon },
	{ name: "Gemini", icon: GeminiIcon },
	{ name: "Grok", icon: GrokIcon },
	{ name: "Mistral", icon: MistralIcon },
	{ name: "Perplexity", icon: PerplexityIcon },
	{ name: "Copilot", icon: CopilotIcon },
	{ name: "DeepSeek", icon: DeepSeekIcon },
	{ name: "Google AI Mode", icon: GoogleIcon },
	{ name: "Google AI Overviews", icon: GoogleIcon },
];

const accessMethods = [
	{ label: "Web scraping", note: "what users actually see" },
	{ label: "Provider APIs", note: "direct model responses" },
	{ label: "OpenRouter", note: "one key, many models" },
	{ label: "Your own keys", note: "bring and control them" },
];

export function ModelCoverage() {
	return (
		<section aria-labelledby="models-heading" className="py-20 lg:py-24">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="grid gap-10 lg:grid-cols-12 lg:items-end">
					<SectionHeading
						id="models-heading"
						eyebrow="Model coverage"
						title="Track every major AI model."
						lede="See what ChatGPT users see, via web scraping. Track LLM responses through their APIs or OpenRouter. Bring your own keys."
						className="lg:col-span-7"
					/>
					<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/10 lg:col-span-5">
						{accessMethods.map((m) => (
							<div key={m.label} className="bg-zinc-950 px-4 py-3">
								<dt className="font-mono text-xs text-zinc-200">{m.label}</dt>
								<dd className="mt-0.5 text-xs text-zinc-500">{m.note}</dd>
							</div>
						))}
					</dl>
				</div>

				<div className="mt-12 overflow-hidden rounded-xl ring-1 ring-white/10">
					<ul className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-3 md:grid-cols-5">
						{models.map((m) => {
							const Icon = m.icon;
							return (
								<li
									key={m.name}
									className="group flex h-14 items-center gap-3 bg-zinc-950 px-4 transition-colors hover:bg-zinc-900 sm:h-28 sm:flex-col sm:justify-center sm:px-3"
								>
									<span className="size-5 shrink-0 text-zinc-300 transition-colors group-hover:text-white sm:size-7">
										<Icon />
									</span>
									<span className="text-[13px] leading-tight text-zinc-400 group-hover:text-zinc-200 sm:text-center">
										{m.name}
									</span>
								</li>
							);
						})}
					</ul>
					<p className="border-t border-white/10 bg-white/[0.02] px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
						+ and all the rest
					</p>
				</div>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

function QuoteCard({ quote, author, company, companyUrl, mark, large }: CustomerQuote & { large?: boolean }) {
	return (
		<figure className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-7 ring-1 ring-white/10 md:p-9">
			<span
				aria-hidden="true"
				className="pointer-events-none absolute -top-6 right-6 font-serif text-[9rem] leading-none text-white/[0.04]"
			>
				&rdquo;
			</span>
			<blockquote
				className={`relative text-pretty tracking-[-0.02em] text-zinc-100 ${large ? "text-3xl font-medium leading-[1.15] md:text-[2.5rem]" : "text-lg leading-8 md:text-xl md:leading-9"}`}
			>
				&ldquo;{quote}&rdquo;
			</blockquote>
			<figcaption className="relative mt-10 flex items-center justify-between gap-4 border-t border-white/10 pt-5">
				<span className="text-sm">
					<span className="font-medium text-zinc-100">{author}</span>
					<span className="text-zinc-500"> · {company}</span>
				</span>
				<a
					href={companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={company}
					className={`inline-flex items-center rounded text-zinc-300 opacity-80 transition-opacity hover:opacity-100 [&_span.rounded]:ring-1 [&_span.rounded]:ring-white/15 ${FOCUS_RING}`}
				>
					{mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function Testimonials() {
	return (
		<section aria-labelledby="testimonials-heading" className="border-t border-white/[0.06] py-20 lg:py-24">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<SectionHeading id="testimonials-heading" eyebrow="Customers" title="What customers say." />
				<div className="mt-12 grid gap-4 lg:grid-cols-12">
					<div className="lg:col-span-5">
						<QuoteCard {...CUSTOMER_QUOTES.speakeasy} large />
					</div>
					<div className="lg:col-span-7">
						<QuoteCard {...CUSTOMER_QUOTES.tradesites} />
					</div>
				</div>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Open source + community
// ---------------------------------------------------------------------------

const repoTree = [
	{ path: "apps/web", note: "dashboard" },
	{ path: "apps/worker", note: "evaluations + citations" },
	{ path: "apps/cli", note: "@elmohq/cli" },
	{ path: "packages/lib", note: "schema + shared logic" },
	{ path: "LICENSE", note: "MIT" },
];

export function OpenSource() {
	const rootData = useLoaderData({ from: "__root__" });
	const stars = rootData?.githubStars ?? 0;

	return (
		<section aria-labelledby="oss-heading" className="border-t border-white/[0.06] py-20 lg:py-24">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<SectionHeading
					id="oss-heading"
					eyebrow="Open source"
					title="No black box. Read every line."
					lede="The cloud and the self-hosted build are the same code. Verify exactly how each visibility metric is collected, run it on your own infra, or leave any time — you'll never get locked in."
				/>

				<div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					<div className="flex flex-col overflow-hidden rounded-xl bg-white/[0.02] ring-1 ring-white/10 md:col-span-2 lg:col-span-1 lg:row-span-2">
						<div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
							<span className="flex items-center gap-2 font-mono text-xs text-zinc-300">
								<GitHubIcon className="size-4" />
								elmohq/elmo
							</span>
							{stars > 0 ? (
								<span className="flex items-center gap-1 font-mono text-xs text-zinc-400 tabular-nums">
									<Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
									{formatStarCount(stars)}
								</span>
							) : null}
						</div>
						<ul className="flex-1 divide-y divide-white/5 px-5 py-2 font-mono text-[13px]">
							{repoTree.map((row) => (
								<li key={row.path} className="flex items-center justify-between gap-4 py-2.5">
									<span className="text-zinc-200">{row.path}</span>
									<span className="truncate text-xs text-zinc-500">{row.note}</span>
								</li>
							))}
						</ul>
						<div className="border-t border-white/10 p-5">
							<h3 className="text-lg font-medium tracking-tight text-white">Source on GitHub</h3>
							<p className="mt-1.5 text-sm/6 text-zinc-400">
								MIT licensed. Issues, roadmap, and releases happen in the open.
							</p>
							<a
								href={GITHUB_URL}
								target="_blank"
								rel="noopener noreferrer"
								className={`mt-4 inline-flex items-center gap-1 rounded text-sm font-medium text-blue-400 hover:text-blue-300 ${FOCUS_RING}`}
							>
								Star the repo
								<ArrowUpRight className="size-3.5" aria-hidden="true" />
							</a>
						</div>
					</div>

					<div className="flex flex-col justify-center rounded-xl bg-white/[0.02] p-6 ring-1 ring-white/10 lg:col-span-2">
						<div className="grid gap-6 lg:grid-cols-2 lg:items-center">
							<div>
								<h3 className="text-lg font-medium tracking-tight text-white">Self-host in two commands</h3>
								<p className="mt-1.5 text-sm/6 text-zinc-400">
									Elmo runs as a Docker Compose stack managed by the CLI. Use the bundled database or point it at your
									own PostgreSQL. Free forever — you only pay for your infra and API keys.
								</p>
								<a
									href="/docs"
									className={`mt-4 inline-flex items-center gap-1 rounded text-sm font-medium text-blue-400 hover:text-blue-300 ${FOCUS_RING}`}
								>
									Read the self-hosting docs
									<ArrowUpRight className="size-3.5" aria-hidden="true" />
								</a>
							</div>
							<Terminal />
						</div>
					</div>

					<div className="relative overflow-hidden rounded-xl bg-[#5865F2]/[0.07] p-6 ring-1 ring-[#5865F2]/25 lg:col-span-2">
						<DiscordIcon className="pointer-events-none absolute -right-6 -bottom-10 size-44 text-[#5865F2]/10 sm:text-[#5865F2]/15" />
						<div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h3 className="text-lg font-medium tracking-tight text-white">Talk to us!</h3>
								<p className="mt-1.5 max-w-[44ch] text-sm/6 text-zinc-300">
									Ask questions and get help straight from the maintainers on Discord.
								</p>
							</div>
							<a
								href={DISCORD_INVITE_URL}
								target="_blank"
								rel="noopener noreferrer"
								className={`inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-md bg-[#5865F2] px-4 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] sm:self-auto ${FOCUS_RING}`}
							>
								<DiscordIcon className="size-4" />
								Join Discord
								<ArrowUpRight className="size-3.5" aria-hidden="true" />
							</a>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export function Faq({ items }: { items: FaqItem[] }) {
	return (
		<section aria-labelledby="faq-heading" className="border-t border-white/[0.06] py-20 lg:py-24">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-12">
				<div className="lg:col-span-4">
					<Eyebrow>FAQ</Eyebrow>
					<h2
						id="faq-heading"
						className="mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-white md:text-[2.75rem]"
					>
						Questions, answered.
					</h2>
					<p className="mt-4 text-sm/6 text-zinc-400">
						Something else?{" "}
						<a
							href={DISCORD_INVITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="text-zinc-200 underline decoration-white/30 underline-offset-4 hover:decoration-white"
						>
							Ask on Discord
						</a>
						.
					</p>
				</div>
				<div className="divide-y divide-white/10 border-y border-white/10 lg:col-span-8">
					{items.map((item) => (
						<details key={item.question} className="group">
							<summary
								className={`flex cursor-pointer list-none items-center justify-between gap-6 rounded py-5 text-left text-base font-medium text-zinc-100 marker:hidden hover:text-white [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
							>
								{item.question}
								<Plus
									className="size-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-45 group-open:text-zinc-300"
									aria-hidden="true"
								/>
							</summary>
							<p className="-mt-1 max-w-[68ch] pb-6 text-[15px]/7 text-zinc-400">{item.answer}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------------------
// Closing CTA
// ---------------------------------------------------------------------------

const DEMO_URL = bookDemoUrl("marketing-cta");

export function ClosingCTA() {
	return (
		<section aria-labelledby="cta-heading" className="px-4 pb-20 md:px-6 lg:pb-28">
			<div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-zinc-900/60 ring-1 ring-white/10">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_100%_100%,black,transparent)]"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -right-40 -bottom-40 size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(37_99_235/0.35),transparent)]"
				/>
				<div className="relative grid items-center gap-10 p-6 sm:p-8 md:p-12 lg:grid-cols-12 lg:p-16">
					<div className="lg:col-span-7">
						<Eyebrow>Get started</Eyebrow>
						<h2
							id="cta-heading"
							className="mt-4 max-w-[16ch] text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.035em] text-white md:text-5xl"
						>
							Start tracking AI answers today.
						</h2>
						<p className="mt-5 max-w-[48ch] text-pretty text-base/7 text-zinc-400 md:text-lg/8">
							Sign up for the cloud and we run everything for you from ${CLOUD_ENTRY_PRICE_USD}/mo, or run the same
							open-source product on your own infra for free.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-2.5">
							<CloudCTA />
							<SelfHostCTA />
							<QuietLink href={GITHUB_URL}>View source</QuietLink>
						</div>
						<p className="mt-5 text-sm text-zinc-500">
							Rather be shown around?{" "}
							<a
								href={DEMO_URL}
								target="_blank"
								rel={externalRel(DEMO_URL)}
								className="text-zinc-300 underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white"
							>
								Book a 30-minute demo
							</a>
							.
						</p>
					</div>
					<div className="lg:col-span-5">
						<Terminal />
					</div>
				</div>
			</div>
		</section>
	);
}
