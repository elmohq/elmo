import { Link, useLoaderData } from "@tanstack/react-router";
import { Activity, ArrowUpRight, GitBranch, type LucideIcon, Map as MapIcon, Scale, Star } from "lucide-react";
import { formatStarCount } from "@/lib/github-stars";
import { SectionHeading } from "./ui";

interface ProofLink {
	icon: LucideIcon;
	title: string;
	body: string;
	meta: React.ReactNode;
	href: string;
	external?: boolean;
}

function ProofCard({ item }: { item: ProofLink }) {
	const Icon = item.icon;
	const inner = (
		<>
			<span className="flex items-center justify-between">
				<span className="inline-flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
					<Icon className="size-4" aria-hidden="true" />
				</span>
				<ArrowUpRight
					className="size-4 text-zinc-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-900"
					aria-hidden="true"
				/>
			</span>
			<span className="mt-5 block text-[15px] font-semibold text-zinc-950">{item.title}</span>
			<span className="mt-1 block text-pretty text-sm/6 text-zinc-600">{item.body}</span>
			<span className="mt-4 block font-mono text-[11px] text-zinc-500">{item.meta}</span>
		</>
	);
	const cls =
		"group flex h-full flex-col rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgb(24_24_27/0.07),0_1px_2px_rgb(24_24_27/0.04)] transition hover:shadow-[0_0_0_1px_rgb(37_99_235/0.35),0_12px_28px_-14px_rgb(37_99_235/0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
	return item.external ? (
		<a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>
			{inner}
		</a>
	) : (
		<Link to={item.href} className={cls}>
			{inner}
		</Link>
	);
}

/** Proof a closed competitor can't copy: the public record of the project itself. */
export function Proof() {
	const rootData = useLoaderData({ from: "__root__" });
	const stars = rootData?.githubStars ?? 0;

	const items: ProofLink[] = [
		{
			icon: Scale,
			title: "Read the code",
			body: "Provider integrations, answer parsing, and the math behind every metric, all MIT-licensed.",
			meta:
				stars > 0 ? (
					<span className="inline-flex items-center gap-1.5">
						github.com/elmohq/elmo
						<span className="inline-flex items-center gap-0.5 text-zinc-700">
							<Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
							{formatStarCount(stars)}
						</span>
					</span>
				) : (
					"github.com/elmohq/elmo"
				),
			href: "https://github.com/elmohq/elmo",
			external: true,
		},
		{
			icon: GitBranch,
			title: "See what shipped",
			body: "Every release, with notes, in a public changelog.",
			meta: `Latest: v${__APP_VERSION__}`,
			href: "/changelog",
		},
		{
			icon: MapIcon,
			title: "See what's next",
			body: "A public roadmap. React to or comment on the GitHub issues to move them up.",
			meta: "/roadmap",
			href: "/roadmap",
		},
		{
			icon: Activity,
			title: "Check the data providers",
			body: "We run every supported scraper continuously and publish its success rate and speed.",
			meta: "/status",
			href: "/status",
		},
	];

	return (
		<section className="bg-white">
			<div className="mx-auto max-w-6xl px-4 pb-20 pt-8 md:px-6 lg:pb-28 lg:pt-12">
				<div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12">
					<div className="lg:col-span-5">
						<SectionHeading
							eyebrow="Built in the open"
							title="Proof you can check for yourself."
							lede="No headline stat to take on trust. The code, the release history, the roadmap, and our data providers' track record are all public."
						/>
					</div>

					<figure className="lg:col-span-7">
						<div className="rounded-3xl bg-gradient-to-b from-zinc-50 to-white p-3 ring-1 ring-zinc-200/70 sm:p-4">
							<img
								src="/repo-activity.svg"
								alt="Elmo's GitHub activity over the last 30 days: commits, merged pull requests, closed issues, releases, contributors, and commits per week."
								width={840}
								height={431}
								loading="lazy"
								decoding="async"
								className="block h-auto w-full"
							/>
						</div>
						<figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-zinc-500">
							<span>Pulled from GitHub on a schedule, the same card as our README. Not a mockup.</span>
							<a
								href="https://github.com/elmohq/elmo/pulse"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800"
							>
								Verify on GitHub
								<ArrowUpRight className="size-3.5" aria-hidden="true" />
							</a>
						</figcaption>
					</figure>
				</div>

				<div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{items.map((item) => (
						<ProofCard key={item.title} item={item} />
					))}
				</div>
			</div>
		</section>
	);
}
