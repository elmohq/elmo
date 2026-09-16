import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowUpRight } from "lucide-react";
import { DirectoryHero, ElmoCta } from "@/components/directory-shell";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { GROUP_BLURBS, STAT_GROUPS, type Stat, type StatGroup, stats, supportingPosts } from "@/data/statistics";
import { breadcrumbJsonLd, canonicalUrl, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "AI Search Statistics: 22 Findings on Citations & Visibility · Elmo";
const description =
	"Statistics on AI search, answer engine optimization and AI citations — what share of searches carry an AI Overview, which domains get cited, and which GEO tactics measurably work. Every figure sourced.";

const lead =
	"Twenty-two figures on how AI answer engines cite, drawn from published studies and our own prompt tracking. Every one links to the working behind it, including the ones that contradict each other.";

interface StatWithPost extends Stat {
	url: string;
	postTitle: string;
}

interface SupportingPost {
	url: string;
	title: string;
	description: string;
	group: StatGroup;
}

const loadStats = createServerFn({ method: "GET" }).handler(
	async (): Promise<{ resolved: StatWithPost[]; supporting: SupportingPost[] }> => {
		const { blogSource } = await import("@/lib/blog");
		const pages = new Map(blogSource.getPages().map((page) => [page.url.replace("/blog/", ""), page]));
		const resolved = stats.flatMap((stat) => {
			const page = pages.get(stat.slug);
			if (!page) return [];
			return [{ ...stat, url: page.url, postTitle: page.data.title }];
		});
		const supporting = supportingPosts.flatMap(({ slug, group }) => {
			const page = pages.get(slug);
			if (!page) return [];
			return [{ url: page.url, title: page.data.title, description: page.data.description ?? "", group }];
		});
		return { resolved, supporting };
	},
);

export const Route = createFileRoute("/statistics")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/statistics" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/statistics") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AI search statistics", path: "/statistics" },
			]),
			itemListJsonLd(stats.map((stat) => ({ name: `${stat.value} — ${stat.claim}`, path: `/blog/${stat.slug}` }))),
		],
	}),
	loader: async () => await loadStats(),
	component: StatisticsPage,
});

function StatisticsPage() {
	const { resolved, supporting } = Route.useLoaderData();
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryHero eyebrow="Statistics" title="AI search statistics" lead={lead} />

				<section className="border-b border-zinc-200 bg-white py-12">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<div className="max-w-3xl space-y-5 text-lg leading-relaxed text-zinc-700">
							<p>
								Most numbers quoted about AI search come without a denominator. These do. Each figure names its source
								and links to the piece that works through how it was measured and where it disagrees with the next
								study.
							</p>
							<p>Free to cite, with attribution to the original source rather than to us where the two differ.</p>
						</div>

						{STAT_GROUPS.map((group) => {
							const inGroup = resolved.filter((stat) => stat.group === group);
							const extras = supporting.filter((post) => post.group === group);
							if (inGroup.length === 0 && extras.length === 0) return null;
							return (
								<div key={group} className="mt-14">
									<h2 className="font-heading text-2xl text-zinc-950">{group}</h2>
									<p className="mt-2 max-w-3xl leading-relaxed text-zinc-600">{GROUP_BLURBS[group]}</p>
									<ul className="mt-6 divide-y divide-zinc-200 border-t border-zinc-200">
										{inGroup.map((stat) => (
											<li key={stat.slug} className="py-5">
												<div className="flex flex-col gap-1.5 sm:flex-row sm:gap-6">
													<span className="font-heading shrink-0 text-2xl text-blue-700 tabular-nums sm:w-44">
														{stat.value}
													</span>
													<div className="max-w-3xl">
														<p className="leading-relaxed text-zinc-700">{stat.claim}</p>
														<p className="mt-1.5 text-sm text-zinc-500">
															{stat.source} —{" "}
															<a
																href={stat.url}
																className="group inline-flex items-center gap-1 underline underline-offset-2 hover:text-zinc-900"
															>
																{stat.postTitle}
																<ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />
															</a>
														</p>
													</div>
												</div>
											</li>
										))}
										{extras.map((post) => (
											<li key={post.url} className="py-5">
												<a href={post.url} className="group flex flex-col gap-1">
													<span className="flex items-start gap-1.5 font-semibold text-zinc-950">
														{post.title}
														<ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-hover:-translate-y-0.5" />
													</span>
													<span className="max-w-3xl text-sm leading-relaxed text-zinc-600">{post.description}</span>
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
