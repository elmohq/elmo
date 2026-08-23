import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ElmoCta } from "@/components/directory-shell";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { freeTools } from "@/data/tools";
import { breadcrumbJsonLd, canonicalUrl, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "Free AEO Tools: llms.txt & AI Crawler Checkers · Elmo";
const description =
	"Free tools for AI search visibility: generate an llms.txt from any sitemap, and check which AI crawlers your robots.txt allows. No signup, nothing stored.";

export const Route = createFileRoute("/tools/")({
	head: () => ({
		meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path: "/tools" })],
		links: [{ rel: "canonical", href: canonicalUrl("/tools") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Free tools", path: "/tools" },
			]),
			itemListJsonLd(
				freeTools.map((tool) => ({
					name: tool.name,
					path: `/tools/${tool.slug}`,
					description: tool.short,
				})),
			),
		],
	}),
	component: ToolsIndex,
});

function ToolsIndex() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<section className="border-b border-zinc-200 bg-white py-12 lg:py-20">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ Free tools</p>
						<h1 className="font-heading mt-2 text-4xl text-balance text-zinc-950 md:text-5xl">Free AEO tools</h1>
						<p className="mt-4 max-w-3xl text-lg text-balance text-zinc-600">
							Small utilities for the technical side of answer engine optimization. Paste a domain, get an answer. No
							account, no email, nothing stored.
						</p>
					</div>
				</section>

				<section className="border-b border-zinc-200 bg-zinc-50 py-10">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<div className="grid gap-5 sm:grid-cols-2">
							{freeTools.map((tool) => (
								<a
									key={tool.slug}
									href={`/tools/${tool.slug}`}
									className="flex flex-col rounded-md border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300"
								>
									<h2 className="inline-flex items-center gap-1.5 font-heading text-xl text-zinc-950">
										{tool.name}
										<ArrowRight className="size-4" />
									</h2>
									<p className="mt-2 text-sm leading-relaxed text-zinc-600">{tool.short}</p>
								</a>
							))}
						</div>
					</div>
				</section>

				<section className="border-b border-zinc-200 bg-white py-12">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<h2 className="font-heading text-2xl text-zinc-950 md:text-3xl">Why these two first</h2>
						<div className="mt-6 max-w-3xl space-y-5 leading-relaxed text-zinc-600">
							<p>
								Both answer a question you cannot eyeball reliably. Reading a robots.txt and working out whether{" "}
								<code className="font-mono text-xs">ClaudeBot</code> is actually blocked means applying the group
								selection and longest-match rules in RFC 9309 in your head, and the common mistakes — assuming a global{" "}
								<code className="font-mono text-xs">Allow</code> overrides a named block, or that Google-Extended
								controls AI Overviews — are exactly the ones a careful reader still makes.
							</p>
							<p>
								An llms.txt is the same shape of problem in reverse: the format is trivial, and assembling one by hand
								across a few hundred URLs is not. The generator reads your sitemap and your own page titles, so what
								comes out is your site described in your words.
							</p>
							<p>
								Neither tool costs anything to run and neither needs your email, which is the whole point: they should
								be usable in the ten seconds between wondering and knowing. Elmo itself is open source, so if you want
								to see how a check works, the code is on GitHub.
							</p>
						</div>
					</div>
				</section>

				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
