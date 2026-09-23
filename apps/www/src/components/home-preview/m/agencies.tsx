import { Link } from "@tanstack/react-router";
import { MAX_SELF_SERVE_BRANDS } from "@workspace/config/plans";
import { ArrowRight, Braces, Building2, Check, FileText, type LucideIcon, Palette, Users } from "lucide-react";
import { SectionHeading } from "./ui";

interface Perk {
	icon: LucideIcon;
	title: string;
	body: string;
}

const perks: Perk[] = [
	{
		icon: Users,
		title: "Unlimited seats",
		body: "On every plan, Starter included. Invite your whole team and your clients without counting logins.",
	},
	{
		icon: Braces,
		title: "API and MCP on every plan",
		body: "Pipe the numbers into your own reporting, or ask Claude or Cursor about a client straight from the editor.",
	},
	{
		icon: Building2,
		title: "Several brands per workspace",
		body: `Up to ${MAX_SELF_SERVE_BRANDS} brands on Business and more on a custom plan, each with its own prompts and competitors.`,
	},
	{
		icon: FileText,
		title: "Reports clients can open",
		body: "Generate a visibility report and send a link. The people reading it don't need an Elmo account.",
	},
	{
		icon: Palette,
		title: "White label",
		body: "Your branding on your own domain, with SSO, for agencies reselling AI visibility to their clients.",
	},
];

// Only claims taken from competitors' public pricing pages (see the dated note below the table).
const gated: { feature: string; elmo: string; elsewhere: string }[] = [
	{
		feature: "API access",
		elmo: "Every plan",
		elsewhere: "Enterprise-only at Peec AI and Profound",
	},
	{
		feature: "Seats",
		elmo: "Unlimited on every plan",
		elsewhere: "1 seat on Promptwatch Essential and SE Ranking Core",
	},
	{
		feature: "Claude and Perplexity",
		elmo: "From Basic, $99/mo",
		elsewhere: "Enterprise-only at Peec AI",
	},
	{
		feature: "Self-hosting",
		elmo: "Free, MIT-licensed",
		elsewhere: "Not listed by Peec AI, Profound, Promptwatch, or SE Ranking",
	},
];

export function Agencies() {
	return (
		<section className="border-y border-zinc-200 bg-zinc-50/70">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					eyebrow="Built for agencies"
					title="Every client in one place, with no per-seat math."
					lede="The things agencies usually have to negotiate for come standard, so you can add a client without re-pricing the account."
				/>

				<ul className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-zinc-200/80 ring-1 ring-zinc-200/80 sm:grid-cols-2 lg:grid-cols-5">
					{perks.map((p) => {
						const Icon = p.icon;
						return (
							<li key={p.title} className="bg-white p-6">
								<Icon className="size-5 text-blue-600" aria-hidden="true" />
								<h3 className="mt-5 text-[15px] font-semibold text-zinc-950">{p.title}</h3>
								<p className="mt-1.5 text-pretty text-sm/6 text-zinc-600">{p.body}</p>
							</li>
						);
					})}
				</ul>

				<div className="mt-14 grid gap-8 lg:grid-cols-12 lg:gap-12">
					<div className="lg:col-span-4">
						<h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">Included here, gated elsewhere.</h3>
						<p className="mt-2 text-pretty text-sm/6 text-zinc-600">
							Four things buyers tend to find behind a sales call. On Elmo they're on the price list.
						</p>
						<Link
							to="/ai-visibility-tools/compare"
							className="group mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
						>
							Compare tools in detail
							<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
						</Link>
					</div>
					<div className="lg:col-span-8">
						<div className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)]">
							<table className="w-full text-left text-sm">
								<thead>
									<tr className="border-b border-zinc-200 text-[12px] text-zinc-500">
										<th scope="col" className="px-5 py-3 font-medium">
											<span className="sr-only">Feature</span>
										</th>
										<th scope="col" className="px-5 py-3 font-medium text-zinc-950">
											Elmo
										</th>
										<th scope="col" className="px-5 py-3 font-medium max-sm:hidden">
											Elsewhere
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-zinc-100">
									{gated.map((row) => (
										<tr key={row.feature} className="align-top">
											<th scope="row" className="px-5 py-4 font-medium text-zinc-950">
												{row.feature}
											</th>
											<td className="px-5 py-4 text-zinc-800">
												<span className="inline-flex items-start gap-2">
													<Check
														className="mt-0.5 size-4 shrink-0 text-blue-600"
														strokeWidth={2.5}
														aria-hidden="true"
													/>
													{row.elmo}
												</span>
												<span className="mt-1 block pl-6 text-[13px] text-zinc-500 sm:hidden">{row.elsewhere}</span>
											</td>
											<td className="px-5 py-4 text-zinc-500 max-sm:hidden">{row.elsewhere}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<p className="mt-3 text-xs text-zinc-500">
							Based on public pricing pages, Sept 2026. Elmo's $29 Starter plan tracks ChatGPT only; multi-engine
							tracking starts on Basic.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
