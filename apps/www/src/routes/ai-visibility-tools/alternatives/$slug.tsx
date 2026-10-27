import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudAppUrl } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { CompetitorPricingDetails } from "@/components/competitor-pricing";
import {
	BulletList,
	CompetitorPageLinks,
	CompetitorSignupCta,
	ElmoComparisonTable,
	ProsCons,
} from "@/components/competitor-review";
import { DirectoryBackLink, DirectoryHero, DirectorySection, ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ToolGrid } from "@/components/tool-list";
import {
	type Competitor,
	type CompetitorProfile,
	getAlternatives,
	getAlternativesFaqs,
	getAlternativesVerdict,
	getComparisonSlug,
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

function ProfileSectionView({ section }: { section: ProfileSection }) {
	const table = section.table;
	return (
		<DirectorySection title={section.title}>
			<div className="max-w-3xl space-y-4 leading-relaxed text-zinc-600">
				{section.paragraphs.map((p) => (
					<p key={p}>{p}</p>
				))}
			</div>
			{table ? (
				<div className="mt-8 overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-zinc-200 text-left">
								{table.columns.map((col) => (
									<th key={col} className="py-3 pr-4 font-semibold text-zinc-950">
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{table.rows.map((row) => (
								<tr key={row[0]} className="border-b border-dashed border-zinc-200">
									{row.map((cell, i) => (
										<td
											key={table.columns[i]}
											className={`py-3 pr-4 align-top ${i === 0 ? "font-medium text-zinc-950" : "text-zinc-600"}`}
										>
											{cell}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
					{table.caption ? <p className="mt-3 text-sm text-zinc-500">{table.caption}</p> : null}
				</div>
			) : null}
			{section.links?.length ? (
				<ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
					{section.links.map((link) => (
						<li key={link.href}>
							<a href={link.href} className="font-medium text-blue-700 hover:text-blue-900">
								{link.text} →
							</a>
						</li>
					))}
				</ul>
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
	const review = profile?.pricing ? profile.review : undefined;
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero title={`${competitor.name} Alternatives`} lead={getAlternativesVerdict(competitor)} />

				<DirectorySection title={`Top ${competitor.name} Alternatives and Competitors`}>
					<div className="mb-8 rounded-md border border-blue-200 bg-blue-50/40 p-6">
						<p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">1. Our Pick</p>
						<h3 className="font-heading mt-2 text-xl text-zinc-950">Elmo: The Open-Source Alternative</h3>
						<p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">{ELMO_PITCH}</p>
						<div className="mt-4 flex flex-wrap gap-3">
							<a href={cloudAppUrl("marketing-competitor-alternatives")} className={buttonVariants({ size: "sm" })}>
								Start with Elmo Cloud
							</a>
							<Link to="/pricing" className={buttonVariants({ variant: "outline", size: "sm" })}>
								Elmo pricing
							</Link>
							<Link
								to="/ai-visibility-tools/$slug"
								params={{ slug: getComparisonSlug(competitor) }}
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								Elmo vs {competitor.name}
							</Link>
						</div>
					</div>
					<ToolGrid competitors={alternatives} />
				</DirectorySection>

				{profile?.alternatives?.sections?.map((section) => (
					<ProfileSectionView key={section.title} section={section} />
				))}

				{review ? (
					<DirectorySection title={`How Elmo Compares with ${competitor.name}`}>
						<ElmoComparisonTable competitor={competitor} review={review} />
					</DirectorySection>
				) : null}

				{review ? (
					<DirectorySection title={`Who ${competitor.name} Is For`}>
						<p className="mb-8 max-w-3xl leading-relaxed text-zinc-600">{review.bestFor}</p>
						<div className="grid gap-8 md:grid-cols-2">
							<div>
								<h3 className="font-heading mb-4 text-lg text-zinc-950">Stay with {competitor.name} If</h3>
								<BulletList items={review.pickIf} kind="pro" />
							</div>
							<div>
								<h3 className="font-heading mb-4 text-lg text-zinc-950">Consider an Alternative If</h3>
								<BulletList items={review.lookElsewhereIf} kind="con" />
							</div>
						</div>
					</DirectorySection>
				) : null}

				{profile?.pricing ? (
					<DirectorySection title={`${competitor.name} Pricing`}>
						<CompetitorPricingDetails pricing={profile.pricing} />
					</DirectorySection>
				) : null}

				{review ? (
					<>
						<DirectorySection title={`${competitor.name} Strengths and Limitations`}>
							<ProsCons review={review} />
						</DirectorySection>
						<DirectorySection title={`Switching from ${competitor.name} to Elmo`}>
							<ol className="max-w-3xl list-decimal space-y-3 pl-5 leading-relaxed text-zinc-600">
								{review.migration.map((step) => (
									<li key={step}>{step}</li>
								))}
							</ol>
							<div className="mt-8">
								<CompetitorPageLinks competitor={competitor} current="alternatives" />
							</div>
						</DirectorySection>
						<CompetitorSignupCta
							competitor={competitor}
							from="marketing-competitor-alternatives"
							title={`Try Elmo as Your ${competitor.name} Alternative`}
						/>
					</>
				) : null}

				{competitor.switching ? (
					<DirectorySection title={`Why Teams Leave ${competitor.name}`}>
						<p className="mb-8 max-w-3xl leading-relaxed text-zinc-600">
							What people tell us when they move to Elmo from {competitor.name}, and what we do differently.
						</p>
						<div className="max-w-3xl space-y-8">
							{competitor.switching.reasons.map((reason) => (
								<div key={reason.headline}>
									<h3 className="font-heading mb-2 text-lg text-zinc-950">{reason.headline}</h3>
									<p className="leading-relaxed text-zinc-600">{reason.detail}</p>
									<p className="mt-3 border-l-2 border-zinc-200 pl-4 leading-relaxed text-zinc-700">{reason.elmo}</p>
								</div>
							))}
						</div>
					</DirectorySection>
				) : null}

				<Faq items={faqs} />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
