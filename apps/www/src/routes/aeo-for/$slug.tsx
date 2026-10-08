import { createFileRoute, notFound } from "@tanstack/react-router";
import { PLANS } from "@workspace/config/plans";
import { cloudAppUrl, demoSiteUrl } from "@workspace/config/referrals";
import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { EngineIcon } from "@/components/home/engines";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { LogoStrip } from "@/components/home/logos";
import { ModelCoverage } from "@/components/home/models";
import { Pricing } from "@/components/home/pricing";
import { AI_REVIEWS, PEOPLE, ReviewRow } from "@/components/home/reviews";
import { SelfHost } from "@/components/home/self-host";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { CARD, SectionHeading } from "@/components/home/ui";
import { WhySwitch } from "@/components/home/why-switch";
import { Navbar } from "@/components/navbar";
import { type AeoVertical, aeoVerticals, getAeoVertical } from "@/data/aeo-verticals";
import { externalRel } from "@/lib/external-link";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, howToJsonLd, itemListJsonLd, ogMeta } from "@/lib/seo";

export const Route = createFileRoute("/aeo-for/$slug")({
	loader: ({ params }) => {
		const v = getAeoVertical(params.slug);
		if (!v) throw notFound();
		const others = aeoVerticals.filter((x) => x.slug !== v.slug);
		return { vertical: v, others };
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { vertical: v, others } = loaderData;
		const title = v.metaTitle ?? `AEO for ${v.audience}: Track AI Visibility · Elmo`;
		const description = v.metaDescription ?? v.short;
		const path = `/aeo-for/${v.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AEO by industry", path: "/aeo-for" },
					{ name: v.headline ?? `AEO for ${v.audience}`, path },
				]),
				faqJsonLd(v.faqs),
				howToJsonLd({
					name: `How to improve AI visibility for ${v.audience}`,
					description: v.short,
					steps: v.plays.map((play) => ({ name: play.name, text: play.text })),
				}),
				itemListJsonLd(
					others.map((o) => ({ name: `AEO for ${o.audience}`, path: `/aeo-for/${o.slug}`, description: o.short })),
				),
			],
		};
	},
	component: VerticalPage,
});

const FROM = "marketing-aeo-for-hero";

const BUTTON =
	"inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const PROMPT_ENGINES = [
	{ name: "ChatGPT", iconId: "openai" },
	{ name: "Claude", iconId: "anthropic" },
	{ name: "Gemini", iconId: "gemini" },
	{ name: "Perplexity", iconId: "perplexity" },
	{ name: "AI Overviews", iconId: "google" },
];

function capitalize(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function AudienceBadge({ audience }: { audience: string }) {
	return (
		<span className="inline-flex h-7 items-center gap-2 rounded-full bg-white/80 px-3 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200">
			<span className="size-1.5 rounded-full bg-blue-600" />
			Elmo for {audience}
		</span>
	);
}

function Prompts({ vertical }: { vertical: AeoVertical }) {
	const [lead, ...rest] = vertical.intro;
	return (
		<section className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-12 lg:items-center lg:py-28">
				<div className="lg:col-span-6">
					<SectionHeading title="Your buyers are asking AI. Is it naming you?" lede={lead} />
					<div className="mt-5 max-w-[56ch] space-y-4 text-pretty text-[15px]/7 text-zinc-600">
						{rest.map((p) => (
							<p key={p.slice(0, 32)}>{p}</p>
						))}
					</div>
				</div>
				<div className="lg:col-span-6">
					<div className={`p-5 sm:p-6 ${CARD}`}>
						<p className="text-[13px] font-medium text-zinc-500">Prompts {vertical.audience} should track</p>
						<ul className="mt-4 space-y-2.5">
							{vertical.examplePrompts.map((p) => (
								<li
									key={p}
									className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-[15px] text-zinc-900 ring-1 ring-zinc-200/70"
								>
									<Search className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
									<span className="min-w-0 flex-1 truncate">{p}</span>
								</li>
							))}
						</ul>
						<div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-100 pt-4 text-[13px] text-zinc-500">
							Tracked up to 4× daily in
							<ul className="flex items-center gap-1.5" aria-label="Engines">
								{PROMPT_ENGINES.map((e) => (
									<li
										key={e.name}
										title={e.name}
										className="inline-flex size-7 items-center justify-center rounded-lg bg-white ring-1 ring-zinc-200/80"
									>
										<EngineIcon iconId={e.iconId} className="size-3.5" />
										<span className="sr-only">{e.name}</span>
									</li>
								))}
							</ul>
							and more
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function Playbook({ vertical }: { vertical: AeoVertical }) {
	const cloudUrl = cloudAppUrl(FROM);
	const demoUrl = demoSiteUrl(FROM);
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					title={`The AEO playbook for ${vertical.audience}.`}
					lede="What gets a brand named in AI answers in your category, and where Elmo shows you the gaps."
				/>
				<ol className="mt-12 grid gap-4 md:grid-cols-2">
					{vertical.plays.map((play, i) => (
						<li key={play.name} className={`p-6 ${CARD}`}>
							<p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.015em] text-zinc-950">
								<span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white tabular-nums">
									{i + 1}
								</span>
								{play.name}
							</p>
							<p className="mt-2 text-pretty text-[15px]/6 text-zinc-600">{play.text}</p>
						</li>
					))}
				</ol>

				<div className="mt-5 flex flex-col gap-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
					<div className="max-w-[60ch]">
						<p className="text-lg font-semibold tracking-[-0.015em]">Where Elmo fits</p>
						<p className="mt-2 text-pretty text-[15px]/7 text-blue-50">{vertical.elmoFit}</p>
					</div>
					<div className="flex shrink-0 flex-col gap-2.5 sm:flex-row md:flex-col lg:flex-row">
						<a href={cloudUrl} className={`${BUTTON} bg-white text-blue-700 hover:bg-blue-50`}>
							Get started
							<ArrowRight className="size-4" aria-hidden="true" />
						</a>
						<a
							href={demoUrl}
							target="_blank"
							rel={externalRel(demoUrl)}
							className={`${BUTTON} text-white ring-1 ring-inset ring-white/40 hover:bg-white/10`}
						>
							Try the live demo
							<ArrowUpRight className="size-4" aria-hidden="true" />
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}

function OtherIndustries({ others }: { others: AeoVertical[] }) {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
				<p className="text-sm font-medium text-zinc-500">Elmo for other industries</p>
				<ul className="mt-4 flex flex-wrap gap-2">
					{others.map((o) => (
						<li key={o.slug}>
							<a
								href={`/aeo-for/${o.slug}`}
								className="inline-flex h-8 items-center rounded-full bg-white px-3 text-sm text-zinc-700 ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300"
							>
								{capitalize(o.audience)}
							</a>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

function VerticalPage() {
	const { vertical, others } = Route.useLoaderData() as {
		vertical: AeoVertical;
		others: AeoVertical[];
	};
	const plan = PLANS[vertical.plan];
	const platforms = plan.platformMenu.length === 1 ? "ChatGPT" : `${plan.platformPicks} AI platforms`;
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			<Navbar />
			<main>
				<Hero
					badge={<AudienceBadge audience={vertical.audience} />}
					title={vertical.headline ?? `AEO for ${vertical.audience}`}
					lede={vertical.short}
					selfHost={vertical.technical}
					from={FROM}
				/>
				<LogoStrip />
				<Prompts vertical={vertical} />
				<ReviewRow
					title="Loved by marketers. Recommended by AI."
					reviews={[PEOPLE[vertical.reviews[0]], AI_REVIEWS.chatgpt, PEOPLE[vertical.reviews[1]]]}
				/>
				<Playbook vertical={vertical} />
				<HowItWorks />
				<ModelCoverage />
				<WhySwitch />
				<Pricing
					lede={`We recommend ${plan.name} for ${vertical.audience}: ${plan.maxPrompts} prompts across ${platforms}, checked ${plan.standardRunsPerDay}× daily, for $${plan.monthlyPriceUsd}/mo. Unlimited seats on every plan.`}
					recommended={{ plan: vertical.plan, label: `Best for ${vertical.audience}` }}
				/>
				{vertical.technical ? <SelfHost /> : null}
				<Faq items={vertical.faqs} />
				<Closing from="marketing-aeo-for-closing" />
				<OtherIndustries others={others} />
			</main>
			<Footer />
		</div>
	);
}
