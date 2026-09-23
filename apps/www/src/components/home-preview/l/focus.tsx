import { Link } from "@tanstack/react-router";
import { ArrowRight, Database, type LucideIcon, PenOff, ScanSearch, Users } from "lucide-react";
import { ACCENT_TEXT, CARD, Eyebrow } from "./ui";

interface Principle {
	icon: LucideIcon;
	title: string;
	body: string;
}

const principles: Principle[] = [
	{
		icon: PenOff,
		title: "It measures. You publish.",
		body: "Elmo tells you what to create, refresh or pitch. No agent writes to your site or CMS on your behalf.",
	},
	{
		icon: ScanSearch,
		title: "Every number is checkable.",
		body: "Open any score down to the individual AI answers behind it. The code that computes it is open source.",
	},
	{
		icon: Database,
		title: "Your data, your infra.",
		body: "Self-host and your prompts and answers stay in your own Postgres. Or let us run it for you on Cloud.",
	},
	{
		icon: Users,
		title: "Nothing held back by plan.",
		body: "Unlimited seats and API access on every Cloud plan, so the whole team can use the data.",
	},
];

/** Counter-positions against suites that bundle agents, content and SEO tooling. */
export function Focus() {
	return (
		<section>
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<div className="grid gap-12 lg:grid-cols-12 lg:gap-12">
					<div className="lg:col-span-5">
						<Eyebrow>Why a focused tool</Eyebrow>
						<h2 className="mt-4 text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-slate-950 md:text-[2.6rem]">
							Elmo does <span className={ACCENT_TEXT}>one job</span> well: measure how AI talks about you, and tell you
							what to fix.
						</h2>
						<p className="mt-5 max-w-[46ch] text-pretty text-base/7 text-slate-600">
							Plenty of tools in this space now write content, run agents, or fold AI tracking into a bigger SEO bundle.
							Elmo stays on the part you can't do by hand: asking AI your buyers' questions, on a schedule, and getting
							the numbers right.
						</p>
						<Link
							to="/ai-visibility-tools/compare"
							className="group mt-6 inline-flex items-center gap-1 rounded-sm text-sm font-medium text-blue-700 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
						>
							Compare AI visibility tools
							<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
						</Link>
					</div>
					<ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
						{principles.map((p) => {
							const Icon = p.icon;
							return (
								<li key={p.title} className={`${CARD} flex gap-4 p-5 sm:block sm:p-6`}>
									<span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-600/10">
										<Icon className="size-[18px]" aria-hidden="true" />
									</span>
									<div>
										<h3 className="text-base sm:mt-5 font-semibold text-slate-950">{p.title}</h3>
										<p className="mt-1.5 text-pretty text-sm/6 text-slate-600">{p.body}</p>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			</div>
		</section>
	);
}
