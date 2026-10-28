import { createFileRoute, notFound } from "@tanstack/react-router";
import { cloudAppUrl, demoSiteUrl } from "@workspace/config/referrals";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { FeatureGraphic, featurePath } from "@/components/features";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { Faq } from "@/components/home/faq";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { CARD, SectionHeading } from "@/components/home/ui";
import { Navbar } from "@/components/navbar";
import { type FeatureLink, getProductFeature, type ProductFeature } from "@/data/features";
import { FEATURE_SLUGS, getFeatureLabel, indexableFeatureKeys } from "@/lib/competitors";
import { externalRel } from "@/lib/external-link";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

const FROM = "marketing-features-hero";

const BUTTON =
	"inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export const Route = createFileRoute("/features/$slug")({
	loader: ({ params }) => {
		const feature = getProductFeature(params.slug);
		if (!feature) throw notFound();
		const related = feature.related
			.map((slug) => getProductFeature(slug))
			.filter((f): f is ProductFeature => Boolean(f));
		// A directory slice only exists once enough tools share the feature, so link the ones that are live.
		const indexable = new Set(indexableFeatureKeys());
		const directory: FeatureLink[] = (feature.directoryFeatures ?? [])
			.filter((key) => indexable.has(key))
			.map((key) => ({
				kind: "Tool directory",
				title: `AI visibility tools with ${getFeatureLabel(key).toLowerCase()}`,
				href: `/ai-visibility-tools/features/${FEATURE_SLUGS[key]}`,
			}));
		return { feature, related, directory };
	},
	head: ({ loaderData }) => {
		if (!loaderData) return {};
		const { feature: f } = loaderData;
		const path = featurePath(f.slug);
		return {
			meta: [
				{ title: f.metaTitle },
				{ name: "description", content: f.metaDescription },
				...ogMeta({ title: f.metaTitle, description: f.metaDescription, path, label: "Features" }),
			],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "Features", path: "/features" },
					{ name: f.name, path },
				]),
				faqJsonLd(f.faqs),
			],
		};
	},
	component: FeaturePage,
});

function FeatureHero({ feature }: { feature: ProductFeature }) {
	const cloudUrl = cloudAppUrl(FROM);
	const demoUrl = demoSiteUrl(FROM);
	return (
		<section className="relative overflow-hidden bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
			/>
			<div className="relative mx-auto max-w-6xl px-4 pb-16 pt-8 md:px-6 lg:pb-24">
				<a
					href="/features"
					className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-950"
				>
					<ArrowLeft className="size-3" aria-hidden="true" />
					All features
				</a>
				<div className="mt-10 grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
					<div className="lg:col-span-5">
						<h1 className="text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.04em] text-balance text-zinc-950 sm:text-5xl">
							{feature.title}
						</h1>
						<p className="mt-6 text-pretty text-[17px]/7 text-zinc-600">{feature.lede}</p>
						<div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
							<a href={cloudUrl} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}>
								Get started
								<ArrowRight className="size-4" aria-hidden="true" />
							</a>
							<a
								href={demoUrl}
								target="_blank"
								rel={externalRel(demoUrl)}
								className={`${BUTTON} bg-white text-zinc-950 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300`}
							>
								Try the live demo
								<ArrowUpRight className="size-4" aria-hidden="true" />
							</a>
						</div>
						<p className="mt-5 text-sm text-zinc-500">
							<a
								href={feature.docs.href}
								className="font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 hover:decoration-zinc-500"
							>
								{feature.docs.title}
							</a>
						</p>
					</div>
					<div className="lg:col-span-7">
						<FeatureGraphic graphic={feature.graphic} />
					</div>
				</div>
			</div>
		</section>
	);
}

function Steps({ feature }: { feature: ProductFeature }) {
	const secondary = feature.secondaryGraphic;
	return (
		<section className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-24">
				<SectionHeading title="What you can do" />
				<div className={`mt-10 grid gap-10 ${secondary ? "lg:grid-cols-12 lg:items-center lg:gap-12" : ""}`}>
					<ol className={`grid gap-4 ${secondary ? "lg:col-span-5" : "md:grid-cols-3"}`}>
						{feature.steps.map((step, i) => (
							<li key={step.name} className={`p-6 ${CARD}`}>
								<p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.015em] text-zinc-950">
									<span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white tabular-nums">
										{i + 1}
									</span>
									{step.name}
								</p>
								<p className="mt-2 text-pretty text-[15px]/6 text-zinc-600">{step.text}</p>
							</li>
						))}
					</ol>
					{secondary ? (
						<div className="lg:col-span-7">
							<FeatureGraphic graphic={secondary} />
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}

function Metrics({ feature }: { feature: ProductFeature }) {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:px-6 lg:grid-cols-12 lg:gap-12 lg:py-24">
				<div className="lg:col-span-4">
					<SectionHeading title="Data you can act on" />
				</div>
				<dl className="grid gap-x-10 sm:grid-cols-2 lg:col-span-8">
					{feature.metrics.map((m) => (
						<div key={m.term} className="border-t border-zinc-200 py-5">
							<dt className="font-semibold text-zinc-950">{m.term}</dt>
							<dd className="mt-1.5 text-pretty text-[15px]/6 text-zinc-600">{m.definition}</dd>
						</div>
					))}
				</dl>
			</div>
		</section>
	);
}

function UseCasesAndWhy({ feature }: { feature: ProductFeature }) {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto grid max-w-6xl gap-5 px-4 py-20 md:px-6 lg:grid-cols-2 lg:py-24">
				<div className={`p-6 md:p-8 ${CARD}`}>
					<h2 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-950">Use cases</h2>
					<ul className="mt-6 space-y-4">
						{feature.useCases.map((u) => (
							<li key={u} className="flex gap-3 text-pretty text-[15px]/6 text-zinc-700">
								<Check className="mt-0.5 size-4 shrink-0 text-blue-600" strokeWidth={2.5} aria-hidden="true" />
								{u}
							</li>
						))}
					</ul>
				</div>
				<div className={`p-6 md:p-8 ${CARD}`}>
					<h2 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-950">Why Elmo</h2>
					<ul className="mt-6 space-y-5">
						{feature.why.map((w) => (
							<li key={w.name}>
								<p className="font-semibold text-zinc-950">{w.name}</p>
								<p className="mt-1 text-pretty text-[15px]/6 text-zinc-600">{w.text}</p>
							</li>
						))}
					</ul>
				</div>
			</div>
		</section>
	);
}

function LearnMore({ links }: { links: FeatureLink[] }) {
	return (
		<section className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-20">
				<h2 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-950">Related guides</h2>
				<ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{links.map((l) => (
						<li key={l.href} className="flex">
							<a
								href={l.href}
								className="flex w-full flex-col rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
							>
								<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{l.kind}</span>
								<span className="mt-1.5 text-pretty text-[15px]/6 font-medium text-zinc-950">{l.title}</span>
							</a>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

function RelatedFeatures({ related }: { related: ProductFeature[] }) {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-20">
				<div className="flex flex-wrap items-baseline justify-between gap-4">
					<h2 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-950">Related features</h2>
					<a href="/features" className="text-sm font-medium text-blue-600 hover:text-blue-700">
						All features
					</a>
				</div>
				<ul className="mt-6 grid gap-3 md:grid-cols-3">
					{related.map((f) => (
						<li key={f.slug} className="flex">
							<a
								href={featurePath(f.slug)}
								className="group flex w-full flex-col rounded-md border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300"
							>
								<span className="font-semibold text-zinc-950">{f.name}</span>
								<span className="mt-1.5 flex-1 text-pretty text-sm/6 text-zinc-600">{f.summary}</span>
								<ArrowRight
									className="mt-3 size-4 text-blue-600 transition-transform group-hover:translate-x-0.5"
									aria-hidden="true"
								/>
							</a>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

function FeaturePage() {
	const { feature, related, directory } = Route.useLoaderData() as {
		feature: ProductFeature;
		related: ProductFeature[];
		directory: FeatureLink[];
	};
	const links: FeatureLink[] = [{ kind: "Docs", ...feature.docs }, ...feature.guides, ...directory];
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			<Navbar />
			<main>
				<FeatureHero feature={feature} />
				<Steps feature={feature} />
				<Metrics feature={feature} />
				<UseCasesAndWhy feature={feature} />
				<LearnMore links={links} />
				<RelatedFeatures related={related} />
				<Faq items={feature.faqs} />
				<Closing from="marketing-features-closing" />
			</main>
			<Footer />
		</div>
	);
}
