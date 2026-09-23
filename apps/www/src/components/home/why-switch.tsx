/**
 * The Profound figures are fixed claims supplied by the team, not derived from
 * the competitor data in lib/competitors.
 */
const FACTS = [
	{ lead: "⅓ the price", rest: "of Profound's equivalent plan, on Starter" },
	{ lead: "4× the data", rest: "of Profound's equivalent plan, on Basic" },
	{ lead: "Unlimited seats", rest: "on every plan, for your whole team" },
	{ lead: "API + MCP", rest: "on every plan, to pipe data anywhere" },
	{ lead: "Open source", rest: "self-host it any time, no lock-in" },
];

export function WhySwitch() {
	return (
		<section aria-labelledby="why-switch" className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto max-w-6xl px-4 py-14 md:px-6 lg:py-16">
				<h2
					id="why-switch"
					className="text-center text-2xl font-semibold tracking-[-0.025em] text-zinc-950 md:text-3xl"
				>
					Why teams switch to Elmo
				</h2>
				<ul className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-zinc-200/80 ring-1 ring-zinc-200/80 sm:grid-cols-2 lg:grid-cols-5">
					{FACTS.map((f) => (
						<li key={f.lead} className="bg-white p-6">
							<p className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{f.lead}</p>
							<p className="mt-1 text-pretty text-sm/6 text-zinc-600">{f.rest}</p>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
