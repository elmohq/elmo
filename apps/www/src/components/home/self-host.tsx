import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { QuickstartBlock } from "@/components/quickstart-block";
import { SELF_HOST_LINK } from "@/lib/self-host-link";
import { SectionHeading } from "./ui";

const POINTS = [
	{ title: "Open Source", body: "MIT-licensed and runs on Docker." },
	{ title: "Own Your Data", body: "Everything is stored in Postgres." },
	{ title: "Track Anything", body: "BYOK to track any AI model." },
];

const LINK = "group inline-flex items-center gap-1 text-[15px] font-medium text-blue-600 hover:text-blue-700";

export function SelfHost() {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading align="center" title="Self-host for free." />
				<div className="mx-auto mt-12 max-w-2xl">
					<QuickstartBlock size="lg" />
				</div>
				<ul className="mx-auto mt-12 grid max-w-4xl gap-8 text-center sm:grid-cols-3">
					{POINTS.map((p) => (
						<li key={p.title}>
							<p className="text-base font-semibold text-zinc-950">{p.title}</p>
							<p className="mt-1 text-pretty text-[15px]/6 text-zinc-600">{p.body}</p>
						</li>
					))}
				</ul>
				<div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
					<Link {...SELF_HOST_LINK} className={LINK}>
						Read the setup guide
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
					</Link>
					<a href="https://github.com/elmohq/elmo" target="_blank" rel="noopener noreferrer" className={LINK}>
						View the source on GitHub
						<ArrowUpRight
							className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
							aria-hidden="true"
						/>
					</a>
				</div>
			</div>
		</section>
	);
}
