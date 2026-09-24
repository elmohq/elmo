import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { aeoVerticals } from "@/data/aeo-verticals";
import { breadcrumbJsonLd, canonicalUrl, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "Answer Engine Optimization by Industry · Elmo";
const description =
	"How answer engine optimization applies to your industry — 20 guides covering the prompts that matter, what to publish, and how AI engines pick sources in each one.";

export const Route = createFileRoute("/aeo-for/")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/aeo-for" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/aeo-for") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AEO by industry", path: "/aeo-for" },
			]),
			itemListJsonLd(
				aeoVerticals.map((v) => ({
					name: `AEO for ${v.audience}`,
					path: `/aeo-for/${v.slug}`,
				})),
			),
		],
	}),
	component: AeoForIndex,
});

function AeoForIndex() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<section className="border-b border-zinc-200 bg-white py-12 lg:py-20">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ AEO by industry</p>
						<h1 className="font-heading mt-2 text-4xl text-balance text-zinc-950 md:text-5xl">
							Answer engine optimization, by industry
						</h1>
						<p className="mt-4 max-w-3xl text-lg text-balance text-zinc-600">
							The fundamentals of AEO are the same everywhere, but the prompts that matter and the stakes are not. Pick
							your world.
						</p>
					</div>
				</section>

				<section className="bg-white py-10">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{aeoVerticals.map((v) => (
								<a
									key={v.slug}
									href={`/aeo-for/${v.slug}`}
									className="flex flex-col rounded-md border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300"
								>
									<h2 className="font-semibold text-zinc-950">AEO for {v.audience}</h2>
									<p className="mt-2 text-sm leading-relaxed text-zinc-600">{v.short}</p>
								</a>
							))}
						</div>
					</div>
				</section>

				<section className="border-t border-zinc-200 bg-white py-12">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
							<h2 className="font-heading text-2xl text-zinc-950">Why AEO differs by industry</h2>
							<p>
								Answer engine optimization is the practice of getting a brand named, cited, and described accurately
								when someone asks an AI engine a question. The mechanics are consistent across industries: engines
								retrieve a handful of sources, weigh them for authority and specificity, and synthesise an answer that
								names a few options. What changes from one industry to the next is which sources carry weight and which
								questions decide the outcome.
							</p>
							<p>
								In regulated categories like healthcare, financial services, and insurance, engines lean hard on
								credentials, accreditation, and verifiable third-party sources, because the cost of a wrong answer is
								high. In software and developer tools, documentation quality dominates — a tool whose docs are thorough
								and crawlable gets recommended over an equally capable one whose docs are thin or client-rendered. In
								local and travel categories, independent guides and review platforms outweigh anything a brand publishes
								about itself.
							</p>
							<p>
								The shape of the deciding question changes too. SaaS buyers ask for comparisons and alternatives.
								Industrial buyers ask by specification. Donors ask about efficiency, patients ask about symptoms, and
								travellers ask for itineraries rather than for hotels. Tracking the prompts that actually precede a
								decision in your category — rather than a generic set of brand queries — is what makes AI visibility
								measurable instead of anecdotal.
							</p>
							<p>
								Each guide below covers the prompts worth tracking in that industry, what to publish so engines have
								something specific to cite, and where the category's answers are currently sourced from.
							</p>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
