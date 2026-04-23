import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";

const title = "Our Vision · Elmo";
const description =
	"AI visibility should be affordable, transparent, and built to last. Here's why we're building Elmo differently.";

export const Route = createFileRoute("/vision")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/vision" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/vision") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Vision", path: "/vision" },
			]),
		],
	}),
	component: VisionPage,
});

function SectionNumber({ n }: { n: string }) {
	return (
		<span className="text-primary/20 font-heading text-7xl leading-none select-none md:text-8xl">
			{n}
		</span>
	);
}

function VisionPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				{/* Hero */}
				<section className="relative overflow-hidden py-16 lg:py-28">
					<div className="pointer-events-none absolute inset-0 -z-10">
						<div className="from-primary/[0.04] via-primary/[0.02] absolute inset-0 bg-gradient-to-b to-transparent" />
						<div
							className="absolute inset-0 opacity-[0.03]"
							style={{
								backgroundImage:
									"radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
								backgroundSize: "32px 32px",
							}}
						/>
					</div>
					<div className="mx-auto max-w-3xl px-4 md:px-6">
						<p className="text-primary mb-4 text-sm font-semibold uppercase tracking-widest">
							Our Vision
						</p>
						<h1 className="font-heading text-4xl text-balance md:text-5xl lg:text-6xl">
							AI visibility monitoring should be a commodity, not a luxury.
						</h1>
						<p className="text-muted-foreground mt-6 max-w-2xl text-lg text-balance md:text-xl">
							The emerging market for "AI search optimization" is full of
							inflated pricing, opaque methodologies, and venture-funded
							startups burning cash. We think there's a better way.
						</p>
					</div>
				</section>

				{/* The Problem */}
				<section className="py-12 lg:py-20">
					<div className="mx-auto max-w-3xl px-4 md:px-6">
						<SectionNumber n="01" />
						<h2 className="font-heading mt-2 text-3xl md:text-4xl">
							The market is broken
						</h2>
						<div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed">
							<p>
								A wave of VC-funded startups has flooded the "AI Engine
								Optimization" space, charging premium prices for what amounts to
								running queries against LLM APIs and tracking the results. Many
								of these companies will fail — not because the problem isn't
								real, but because their cost structures require enterprise
								pricing for commodity work.
							</p>
							<p>
								There's also a real possibility that LLM providers themselves
								start offering brand visibility data directly. When that happens,
								many of these platforms lose their reason to exist. We're
								building with that future in mind — if providers open up, we'll
								shift to aggregating their data rather than collecting our own.
							</p>
							<p>
								Meanwhile, the AEO space is rife with misinformation.
								Consultants sell "optimization" services based on flawed
								assumptions about how LLMs work. Rankings are presented as
								deterministic when they're probabilistic. Correlation is sold as
								causation. We believe this hurts everyone.
							</p>
						</div>
					</div>
				</section>

				{/* Our Approach */}
				<section className="border-y py-12 lg:py-20">
					<div className="mx-auto max-w-3xl px-4 md:px-6">
						<SectionNumber n="02" />
						<h2 className="font-heading mt-2 text-3xl md:text-4xl">
							Small, sustainable, built to last
						</h2>
						<div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed">
							<p>
								Elmo is bootstrapped. We don't have investors demanding
								hyper-growth or a board pushing us toward enterprise-only
								pricing. That means we need far less to be a success — and far
								less to stick around long-term.
							</p>
							<p>
								We believe AI visibility data should be cost-effective to access.
								The underlying operations — querying LLMs, parsing responses,
								tracking results over time — aren't expensive to run. The pricing
								should reflect that reality, not the fundraising ambitions of the
								company providing them.
							</p>
							<div className="bg-muted/50 -mx-4 rounded-lg px-4 py-6 md:-mx-8 md:px-8">
								<h3 className="mb-4 text-lg font-semibold">
									How we fund Elmo
								</h3>
								<div className="grid gap-4 sm:grid-cols-3">
									<div className="space-y-1">
										<p className="text-foreground text-sm font-bold">
											Open Source Core
										</p>
										<p className="text-muted-foreground text-sm">
											Self-host for free with open source code, forever. We use affiliate links for some data providers.
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-foreground text-sm font-bold">
											White Label
										</p>
										<p className="text-muted-foreground text-sm">
											Agencies and platforms pay us toembed Elmo under their own brand
											for their clients.
										</p>
									</div>
									<div className="space-y-1">
										<p className="text-foreground text-sm font-bold">
											Cloud Hosting
										</p>
										<p className="text-muted-foreground text-sm">
											In the near future, we will offer a managed version for teams that don't want to
											self-host.
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* Transparency */}
				<section className="py-12 lg:py-20">
					<div className="mx-auto max-w-3xl px-4 md:px-6">
						<SectionNumber n="03" />
						<h2 className="font-heading mt-2 text-3xl md:text-4xl">
							Transparent by default
						</h2>
						<div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed">
							<p>
								Too much of the AEO industry operates like a black box. Vendors
								show you scores and rankings without explaining how they're
								calculated, then charge you to improve numbers you can't
								independently verify.
							</p>
							<p>
								We take the opposite approach. Elmo is open source — you can
								read every line of code that generates your data. Our
								methodology is documented. When we don't know something, we say
								so. When a metric has limitations, we explain what they are.
							</p>
							<p>
								This isn't just an ethical position. It's practical. If you
								understand how the data is collected and what it means, you'll
								make better decisions with it. Opaque tools create dependency.
								Transparent ones create capability.
							</p>
						</div>
					</div>
				</section>

				{/* How We Think About It */}
				<section className="border-y py-12 lg:py-20">
					<div className="mx-auto max-w-3xl px-4 md:px-6">
						<SectionNumber n="04" />
						<h2 className="font-heading mt-2 text-3xl md:text-4xl">
							Understanding how LLMs see the web
						</h2>
						<div className="mt-8 space-y-6 text-[1.0625rem] leading-relaxed">
							<p>
								We're not in the business of "optimizing" your content for AI.
								We're focused on a more fundamental question: how do large
								language models use and interpret the web? How do they decide
								which brands to mention, which sources to cite, and what
								information to present?
							</p>
							<p>
								That framing matters. "Optimization" implies you can game the
								system. Understanding implies you can make informed decisions.
								We're building tools for the latter.
							</p>
							<div className="mt-8 grid gap-6 sm:grid-cols-2">
								<div className="rounded-lg border p-5">
									<h3 className="font-semibold">Diagnose problems</h3>
									<p className="text-muted-foreground mt-2 text-sm">
										Why isn't your brand appearing in AI responses? Is it a
										content gap, a citation issue, or something else entirely?
										Find out what's actually going on.
									</p>
								</div>
								<div className="rounded-lg border p-5">
									<h3 className="font-semibold">Find opportunities</h3>
									<p className="text-muted-foreground mt-2 text-sm">
										Where are LLMs already talking about your space? What
										questions are being asked? Where are competitors showing up
										that you're not?
									</p>
								</div>
								<div className="rounded-lg border p-5">
									<h3 className="font-semibold">Track changes over time</h3>
									<p className="text-muted-foreground mt-2 text-sm">
										LLM responses shift as models are updated and retrained.
										Monitor how your brand's presence evolves across providers
										and model versions.
									</p>
								</div>
								<div className="rounded-lg border p-5">
									<h3 className="font-semibold">
										Understand, don't manipulate
									</h3>
									<p className="text-muted-foreground mt-2 text-sm">
										We give you data and context. What you do with it is up to
										you. We won't pretend there's a magic button.
									</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				{/* CTA */}
				<section className="py-16 lg:py-24">
					<div className="mx-auto max-w-3xl px-4 text-center md:px-6">
						<h2 className="font-heading text-3xl md:text-4xl">
							Join us in building this differently
						</h2>
						<p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-balance">
							Elmo is open source, cost-effective, and built for the long haul.
							If that resonates, we'd love to have you.
						</p>
						<div className="mt-8 flex flex-wrap justify-center gap-3">
							<Button asChild size="lg">
								<Link to="/docs">Read the Docs</Link>
							</Button>
							<Button asChild variant="outline" size="lg">
								<a
									href="https://github.com/elmohq/elmo"
									target="_blank"
									rel="noopener noreferrer"
								>
									View on GitHub
								</a>
							</Button>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
