import { createFileRoute, notFound } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { ArrowRight } from "lucide-react";
import {
	AlternativeGrid,
	AudienceCards,
	CompetitorHero,
	competitorGlance,
	ElmoPickCard,
	QuickComparisonTable,
	SwitchingSteps,
} from "@/components/competitor-page";
import {
	CompetitorPricingDetails,
	CostPerAnswerChart,
	hasCostChart,
	PricingSnapshot,
} from "@/components/competitor-pricing";
import {
	CompetitorPageCards,
	CompetitorPageLinks,
	CompetitorSignupCta,
	ElmoComparisonTable,
	ProsCons,
} from "@/components/competitor-review";
import { DirectoryBackLink, DirectorySection, ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { CARD } from "@/components/home/ui";
import { Navbar } from "@/components/navbar";
import {
	type Competitor,
	type CompetitorPricing,
	type CompetitorProfile,
	getAlternatives,
	getAlternativesFaqs,
	getAlternativesVerdict,
	getCompetitorBySlug,
	getCompetitorProfile,
	hasOwnPages,
	type ProfileSection,
} from "@/lib/competitors";
import type { FaqItem } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

const ELMO_PITCH = `Elmo tracks how ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews mention and cite your brand. It is open source, so you can self-host it for free and verify exactly how each metric is calculated, or start on Elmo Cloud from $${CLOUD_ENTRY_PRICE_USD}/mo with unlimited seats and no sales call.`;

export const Route = createFileRoute("/ai-visibility-tools/alternatives/$slug")({
	loader: ({ params }) => {
		const c = getCompetitorBySlug(params.slug);
		if (!c || !hasOwnPages(c)) throw notFound();
		const alternatives = getAlternatives(c);
		const profile = getCompetitorProfile(c.slug);
		const faqs = [...(profile?.alternatives?.faqs ?? []), ...getAlternativesFaqs(c, alternatives)];
		return { competitor: c, alternatives, faqs, profile };
	},
	head: ({ params, loaderData }) => {
		if (!loaderData) return {};
		const { competitor: c, faqs, profile } = loaderData;
		const title = profile?.alternatives?.title ?? `${c.name} Alternatives | Open-Source AI Visibility · Elmo`;
		const description =
			profile?.alternatives?.description ??
			`The best ${c.name} alternatives for AI visibility tracking, including Elmo — the open-source, self-hosted option you can run for free.`;
		const path = `/ai-visibility-tools/alternatives/${params.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: `${c.name} alternatives`, path },
				]),
				faqJsonLd(faqs),
			],
		};
	},
	component: AlternativesPage,
});

function ProfileSectionView({ section, tone }: { section: ProfileSection; tone: "white" | "muted" }) {
	const table = section.table;
	return (
		<DirectorySection title={section.title} tone={tone}>
			<div className="max-w-3xl space-y-4 text-pretty leading-relaxed text-zinc-600">
				{section.paragraphs.map((p) => (
					<p key={p}>{p}</p>
				))}
			</div>
			{table ? (
				<div className={`mt-8 overflow-hidden ${CARD}`}>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[640px] text-sm">
							<thead>
								<tr className="border-b border-zinc-200 bg-zinc-50/80 text-left">
									{table.columns.map((col) => (
										<th key={col} className="px-4 py-3 text-xs font-medium text-zinc-500">
											{col}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{table.rows.map((row) => (
									<tr key={row[0]} className="border-b border-dashed border-zinc-200 last:border-0">
										{row.map((cell, i) => (
											<td
												key={table.columns[i]}
												className={`px-4 py-3 align-top ${i === 0 ? "font-medium text-zinc-950" : "text-zinc-600"}`}
											>
												{cell}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{table.caption ? (
						<p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">{table.caption}</p>
					) : null}
				</div>
			) : null}
			{section.links?.length ? (
				<ul className="mt-6 flex flex-wrap gap-2 text-sm">
					{section.links.map((link) => (
						<li key={link.href}>
							<a
								href={link.href}
								className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 font-medium text-blue-700 ring-1 ring-zinc-200 transition hover:text-blue-900 hover:ring-zinc-300"
							>
								{link.text}
								<ArrowRight className="size-3.5" />
							</a>
						</li>
					))}
				</ul>
			) : null}
		</DirectorySection>
	);
}

function SwitchingReasons({ competitor }: { competitor: Competitor }) {
	if (!competitor.switching) return null;
	const name = competitor.name;
	return (
		<DirectorySection
			title={`Why Teams Leave ${name}`}
			lede={`What people tell us when they move to Elmo from ${name}, and what we do differently.`}
		>
			<div className="grid gap-5 md:grid-cols-2">
				{competitor.switching.reasons.map((reason) => (
					<article key={reason.headline} className={`flex flex-col p-6 ${CARD}`}>
						<h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">{reason.headline}</h3>
						<p className="mt-2 flex-1 text-pretty text-sm/6 text-zinc-600">{reason.detail}</p>
						<p className="mt-4 rounded-xl bg-blue-50/70 p-4 text-pretty text-sm/6 text-zinc-700">
							<span className="mb-1 block font-semibold text-zinc-950">With Elmo</span>
							{reason.elmo}
						</p>
					</article>
				))}
			</div>
		</DirectorySection>
	);
}

function PricingSection({
	competitor,
	pricing,
	snapshot,
}: {
	competitor: Competitor;
	pricing: CompetitorPricing;
	snapshot: boolean;
}) {
	if (snapshot) {
		return (
			<DirectorySection id="pricing" title={`${competitor.name} Pricing`} tone="muted">
				<PricingSnapshot competitor={competitor} pricing={pricing} />
			</DirectorySection>
		);
	}
	return (
		<DirectorySection id="pricing" title={`${competitor.name} Pricing`}>
			<CompetitorPricingDetails pricing={pricing} />
			{hasCostChart(pricing) ? (
				<div className="mt-10">
					<CostPerAnswerChart competitor={competitor} pricing={pricing} />
				</div>
			) : null}
		</DirectorySection>
	);
}

function AlternativesPage() {
	const { competitor, alternatives, faqs, profile } = Route.useLoaderData() as {
		competitor: Competitor;
		alternatives: Competitor[];
		faqs: FaqItem[];
		profile?: CompetitorProfile;
	};
	const name = competitor.name;
	const review = profile?.pricing ? profile.review : undefined;
	const pricing = profile?.pricing;
	const sections = profile?.alternatives?.sections ?? [];
	const jumpLinks = [
		{ id: "alternatives", label: "Alternatives" },
		{ id: "comparison", label: "Comparison" },
		...(review ? [{ id: "who-its-for", label: "Who It's For" }] : []),
		...(pricing ? [{ id: "pricing", label: "Pricing" }] : []),
		...(review ? [{ id: "switching", label: "Switching" }] : []),
		{ id: "faq", label: "FAQ" },
	];
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen`}>
			<HomeStyles />
			<Navbar />
			<main>
				<DirectoryBackLink />
				<CompetitorHero
					competitor={competitor}
					title={`${name} Alternatives`}
					lead={getAlternativesVerdict(competitor)}
					tiles={competitorGlance(competitor, review)}
					jumpLinks={jumpLinks}
				>
					{review ? <CompetitorPageLinks competitor={competitor} current="alternatives" /> : null}
				</CompetitorHero>

				<DirectorySection id="alternatives" title={`Top ${name} Alternatives and Competitors`} tone="muted">
					<ElmoPickCard competitor={competitor} pitch={ELMO_PITCH} />
					<div className="mt-6">
						<AlternativeGrid competitors={alternatives} />
					</div>
				</DirectorySection>

				<DirectorySection id="comparison" title={`${name} Alternatives Compared`}>
					<QuickComparisonTable competitor={competitor} alternatives={alternatives.slice(0, 5)} />
				</DirectorySection>

				{sections.map((section, i) => (
					<ProfileSectionView key={section.title} section={section} tone={i % 2 === 0 ? "muted" : "white"} />
				))}

				{review ? (
					<DirectorySection title={`How Elmo Compares With ${name}`} tone="muted">
						<ElmoComparisonTable competitor={competitor} review={review} />
					</DirectorySection>
				) : null}

				{review ? (
					<DirectorySection id="who-its-for" title={`Who ${name} Is For`} lede={review.bestFor}>
						<AudienceCards name={name} stay={review.pickIf} leave={review.lookElsewhereIf} />
					</DirectorySection>
				) : null}

				{pricing ? <PricingSection competitor={competitor} pricing={pricing} snapshot={Boolean(review)} /> : null}

				{review ? (
					<>
						<DirectorySection title={`${name} Strengths and Limitations`}>
							<ProsCons review={review} />
						</DirectorySection>
						<DirectorySection id="switching" title={`Switching From ${name} to Elmo`} tone="muted">
							<SwitchingSteps steps={review.migration} />
						</DirectorySection>
						<CompetitorSignupCta
							competitor={competitor}
							from="marketing-competitor-alternatives"
							title={`Try Elmo as Your ${name} Alternative`}
						/>
					</>
				) : null}

				<SwitchingReasons competitor={competitor} />

				<div id="faq" className="scroll-mt-16">
					<Faq items={faqs} />
				</div>
				{review ? (
					<DirectorySection title={`More on ${name}`} tone="muted">
						<CompetitorPageCards competitor={competitor} current="alternatives" />
					</DirectorySection>
				) : null}
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
