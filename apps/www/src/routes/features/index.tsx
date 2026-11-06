import { createFileRoute } from "@tanstack/react-router";
import { FeatureCard, featurePath } from "@/components/features";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { Navbar } from "@/components/navbar";
import { productFeatures } from "@/data/features";
import { breadcrumbJsonLd, canonicalUrl, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "Features: AI Visibility, Citation & Competitor Tracking · Elmo";
const description =
	"Everything Elmo does: AI visibility tracking across every engine, share of voice, sentiment, citations, query fan-out, prompt tracking, recommendations, reporting, and an API and MCP server.";

export const Route = createFileRoute("/features/")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/features" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/features") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Features", path: "/features" },
			]),
			itemListJsonLd(productFeatures.map((f) => ({ name: f.name, path: featurePath(f.slug), description: f.summary }))),
		],
	}),
	component: FeaturesPage,
});

function FeaturesPage() {
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			<Navbar />
			<main>
				<section className="relative overflow-hidden border-b border-zinc-200/80 bg-white">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
					/>
					<div className="relative mx-auto max-w-6xl px-4 pb-14 pt-14 md:px-6 md:pt-20 lg:pb-20">
						<h1 className="max-w-3xl text-[2.75rem] font-semibold leading-[1] tracking-[-0.04em] text-balance text-zinc-950 sm:text-6xl">
							All you need to grow AI visibility.
						</h1>
						<p className="mt-6 max-w-[60ch] text-pretty text-[17px]/7 text-zinc-600 md:text-xl/8">
							Elmo tracks how ChatGPT, Google AI Overviews, Perplexity, Gemini, and other AI engines talk about your
							brand: whether they mention you, how they describe you, which competitors they name instead, and which
							sources they cite. Then it tells you what to do about it.
						</p>
					</div>
				</section>

				<section className="bg-zinc-50/70">
					<div className="mx-auto max-w-6xl px-4 py-14 md:px-6 lg:py-20">
						<ul className="grid gap-5 md:grid-cols-2">
							{productFeatures.map((f) => (
								<li key={f.slug} className="flex">
									<FeatureCard feature={f} />
								</li>
							))}
						</ul>
					</div>
				</section>

				<Closing from="marketing-features-closing" />
			</main>
			<Footer />
		</div>
	);
}
