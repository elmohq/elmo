import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { LogoStrip } from "@/components/home/logos";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { CARD, SectionHeading } from "@/components/home/ui";
import { Navbar } from "@/components/navbar";
import { aeoVerticals } from "@/data/aeo-verticals";
import { breadcrumbJsonLd, canonicalUrl, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "Answer Engine Optimization by Industry · Elmo";
const description =
	"How answer engine optimization applies to your industry — 20 guides covering the prompts that matter, what to publish, and how AI engines pick sources in each one.";

export const Route = createFileRoute("/aeo-for/")({
	loader: () => ({
		items: aeoVerticals.map((v) => ({ name: `AEO for ${v.audience}`, path: `/aeo-for/${v.slug}` })),
	}),
	head: ({ loaderData }) => ({
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
			itemListJsonLd(loaderData?.items ?? []),
		],
	}),
	component: AeoForIndex,
});

function AeoForIndex() {
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			<Navbar />
			<main>
				<section className="relative overflow-hidden bg-white">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
					/>
					<div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-16 pt-14 text-center md:px-6 md:pt-20">
						<h1 className="text-[2.75rem] font-semibold leading-[1] tracking-[-0.04em] text-balance text-zinc-950 sm:text-6xl">
							Answer engine optimization, by industry
						</h1>
						<p className="mt-6 max-w-[60ch] text-pretty text-[17px]/7 text-zinc-600 md:text-xl/8">
							The fundamentals of AEO are the same everywhere, but the prompts that matter and the stakes are not. Pick
							your world.
						</p>
					</div>
				</section>

				<section className="bg-white pb-20 lg:pb-28">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{aeoVerticals.map((v) => (
								<li key={v.slug} className="flex">
									<a
										href={`/aeo-for/${v.slug}`}
										className={`group flex flex-1 flex-col p-6 transition hover:shadow-[0_0_0_1px_rgb(37_99_235/0.45),0_16px_40px_-20px_rgb(37_99_235/0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${CARD}`}
									>
										<h2 className="flex items-center justify-between gap-3 text-base font-semibold text-zinc-950">
											AEO for {v.audience}
											<ArrowRight
												className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
												aria-hidden="true"
											/>
										</h2>
										<p className="mt-2 text-pretty text-sm/6 text-zinc-600">{v.short}</p>
									</a>
								</li>
							))}
						</ul>
					</div>
				</section>

				<LogoStrip />

				<section className="border-t border-zinc-200/80 bg-zinc-50/70">
					<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
						<SectionHeading title="Why AEO differs by industry" />
						<div className="mt-8 max-w-3xl space-y-5 text-pretty text-[17px]/8 text-zinc-600">
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
								Each guide above covers the prompts worth tracking in that industry, what to publish so engines have
								something specific to cite, and where the category's answers are currently sourced from.
							</p>
						</div>
					</div>
				</section>

				<Closing from="marketing-aeo-for-closing" />
			</main>
			<Footer />
		</div>
	);
}
