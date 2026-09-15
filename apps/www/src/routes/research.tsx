import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowUpRight } from "lucide-react";
import { DirectoryHero, ElmoCta } from "@/components/directory-shell";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { RESEARCH_TOPICS, type ResearchTopic, researchEntries, TOPIC_BLURBS } from "@/data/research";
import { formatPostDate } from "@/lib/format";
import { breadcrumbJsonLd, canonicalUrl, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "AI Search Research — Citation Data & Studies · Elmo";
const description =
	"Original research on AI search: which domains answer engines cite, how volatile those citations are, which GEO tactics measurably work, and where visibility tools disagree.";

const lead =
	"We run millions of prompts through the major answer engines. These are the findings worth writing down — which sources get cited, how much they move, and which tactics survive measurement.";

interface ResearchPost {
	slug: string;
	topic: ResearchTopic;
	url: string;
	title: string;
	description: string;
	date: string;
}

const listResearch = createServerFn({ method: "GET" }).handler(async (): Promise<ResearchPost[]> => {
	const { blogSource } = await import("@/lib/blog");
	const pages = new Map(blogSource.getPages().map((page) => [page.url.replace("/blog/", ""), page]));
	return researchEntries
		.flatMap(({ slug, topic }) => {
			const page = pages.get(slug);
			if (!page) return [];
			return [
				{
					slug,
					topic,
					url: page.url,
					title: page.data.title,
					description: page.data.description ?? "",
					date: page.data.date,
				},
			];
		})
		.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
});

export const Route = createFileRoute("/research")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/research" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/research") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Research", path: "/research" },
			]),
			itemListJsonLd(researchEntries.map(({ slug }) => ({ name: slug, path: `/blog/${slug}` }))),
		],
	}),
	loader: async () => ({ posts: await listResearch() }),
	component: ResearchPage,
});

function ResearchPage() {
	const { posts } = Route.useLoaderData();
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryHero eyebrow="Research" title="AI search research" lead={lead} />

				<section className="border-b border-zinc-200 bg-white py-12">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<div className="max-w-3xl space-y-5 text-lg leading-relaxed text-zinc-700">
							<p>
								Most claims about AI search are untestable. These pieces start from data — our own prompt runs, public
								datasets, or published studies reconciled against each other — and say what the numbers support and what
								they do not.
							</p>
							<p>
								Everything here is free to cite. If you want the underlying method rather than the finding, each piece
								states how it was measured.
							</p>
						</div>

						{RESEARCH_TOPICS.map((topic) => {
							const inTopic = posts.filter((post) => post.topic === topic);
							if (inTopic.length === 0) return null;
							return (
								<div key={topic} className="mt-14">
									<h2 className="font-heading text-2xl text-zinc-950">{topic}</h2>
									<p className="mt-2 max-w-3xl leading-relaxed text-zinc-600">{TOPIC_BLURBS[topic]}</p>
									<ul className="mt-6 divide-y divide-zinc-200 border-t border-zinc-200">
										{inTopic.map((post) => (
											<li key={post.slug}>
												<a href={post.url} className="group flex flex-col gap-1 py-5">
													<span className="flex items-start gap-1.5 font-semibold text-zinc-950">
														{post.title}
														<ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
													</span>
													<span className="max-w-3xl text-sm leading-relaxed text-zinc-600">{post.description}</span>
													<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
														{formatPostDate(post.date)}
													</span>
												</a>
											</li>
										))}
									</ul>
								</div>
							);
						})}
					</div>
				</section>

				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
