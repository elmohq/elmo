import { createFileRoute, notFound } from "@tanstack/react-router";
import { CompetitorPricingDetails } from "@/components/competitor-pricing";
import {
	DirectoryBackLink,
	DirectoryElmoBanner,
	DirectoryHero,
	DirectorySection,
	ElmoCta,
} from "@/components/directory-shell";
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
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero title={`${competitor.name} alternatives`} lead={getAlternativesVerdict(competitor)} />

				<DirectoryElmoBanner
					pitch="Elmo tracks how ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews mention and cite your brand. It is open source, so you self-host it for free, keep your data in-house, and verify exactly how each metric is calculated. No per-seat pricing, no black-box scores, no lock-in."
					comparison={{
						slug: getComparisonSlug(competitor),
						name: competitor.name,
					}}
				/>

				{profile?.alternatives?.sections?.map((section) => (
					<ProfileSectionView key={section.title} section={section} />
				))}

				{profile?.pricing ? (
					<DirectorySection title={`${competitor.name} pricing`}>
						<CompetitorPricingDetails pricing={profile.pricing} />
					</DirectorySection>
				) : null}

				{competitor.switching ? (
					<DirectorySection title={`Why teams leave ${competitor.name}`}>
						<p className="mb-8 max-w-3xl leading-relaxed text-zinc-600">
							What people tell us when they move to Elmo, and what we do differently. {competitor.name} is a capable
							product with real customers, so take this as the case for a different set of tradeoffs rather than a
							verdict on the tool.
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

				<DirectorySection title={`Top ${competitor.name} alternatives and competitors`}>
					<ToolGrid competitors={alternatives} />
				</DirectorySection>

				<Faq items={faqs} />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
