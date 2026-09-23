import { ArrowRight } from "lucide-react";
import { MODELS } from "./models";

// Every value on the "With Elmo" side is illustrative. Tallypine is a made-up
// invoicing app, so nobody reads this as a real customer's results.

const BRAND = "Tallypine";
const PROMPT = "best invoicing app for freelancers";

const RANKS: { engine: string; label: string; rank: number | null }[] = [
	{ engine: "ChatGPT", label: "ChatGPT", rank: 2 },
	{ engine: "Claude", label: "Claude", rank: 1 },
	{ engine: "Gemini", label: "Gemini", rank: null },
	{ engine: "Perplexity", label: "Perplexity", rank: 3 },
	{ engine: "Google AI Overviews", label: "AI Overviews", rank: 4 },
];

const SOURCES = [
	{ domain: "reddit.com", share: 31 },
	{ domain: "capterra.com", share: 22 },
	{ domain: "tallypine.com", share: 12 },
];

function iconFor(name: string) {
	return MODELS.find((m) => m.name === name)?.icon ?? MODELS[0].icon;
}

function EngineIcon({ name, className }: { name: string; className: string }) {
	const Icon = iconFor(name);
	return (
		<span className={`inline-block size-3.5 shrink-0 ${className}`}>
			<Icon />
		</span>
	);
}

function Row({
	label,
	hint,
	without,
	withElmo,
}: {
	label: string;
	hint: string;
	without: React.ReactNode;
	withElmo: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-2 border-t border-zinc-200 md:grid-cols-[13rem_1fr_1fr] lg:grid-cols-[15rem_1fr_1fr]">
			<div className="col-span-2 pb-3 pt-5 md:col-span-1 md:py-7 md:pr-8">
				<h3 className="text-sm font-medium text-zinc-950">{label}</h3>
				<p className="mt-1 hidden text-[13px]/5 text-zinc-500 md:block">{hint}</p>
			</div>
			<div className="bg-zinc-50/80 px-3 pb-5 pt-3 md:px-6 md:py-7">{without}</div>
			<div className="px-3 pb-5 pt-3 md:px-6 md:py-7">{withElmo}</div>
		</div>
	);
}

const muted = "text-[13px]/5 text-zinc-400 md:text-sm/6";

export function Contrast() {
	return (
		<section aria-labelledby="g-contrast-title" className="pb-20 md:pb-28">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<h2
					id="g-contrast-title"
					className="max-w-[22ch] text-2xl font-medium leading-[1.15] tracking-[-0.025em] text-balance text-zinc-950 md:text-[2rem]"
				>
					Right now, you're guessing. Elmo gives you the readout.
				</h2>
				<p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
					<span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-amber-800">Example</span>
					<span className="ml-2">{BRAND} is a fictional brand</span>
				</p>
			</div>

			<div className="mt-8 md:mt-10">
				<div className="grid grid-cols-2 md:grid-cols-[13rem_1fr_1fr] lg:grid-cols-[15rem_1fr_1fr]">
					<div className="hidden md:block md:pr-8">
						<p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">Prompt</p>
						<p className="mt-1.5 text-sm text-zinc-700">“{PROMPT}”</p>
					</div>
					<div className="flex items-center gap-2 rounded-t-lg bg-zinc-50/80 px-3 py-3 md:px-6">
						<span className="size-1.5 rounded-full bg-zinc-300" aria-hidden="true" />
						<span className="text-sm font-medium text-zinc-500">Without Elmo</span>
					</div>
					<div className="flex items-center gap-2 px-3 py-3 md:px-6">
						<span className="size-1.5 rounded-full bg-blue-600" aria-hidden="true" />
						<span className="text-sm font-medium text-zinc-950">With Elmo</span>
					</div>
				</div>
				<p className="border-t border-zinc-200 py-3 text-[13px] text-zinc-600 md:hidden">
					<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Prompt</span> “{PROMPT}”
				</p>

				<Row
					label="Are we in the answer?"
					hint="How often AI answers name you."
					without={
						<div>
							<p className="text-4xl font-medium tracking-[-0.03em] text-zinc-300 md:text-5xl">?%</p>
							<div className="mt-3 h-1.5 rounded-full border border-dashed border-zinc-300" aria-hidden="true" />
							<p className={`mt-3 ${muted}`}>Someone asked ChatGPT once. It said something different the next day.</p>
						</div>
					}
					withElmo={
						<div>
							<p className="text-4xl font-medium tracking-[-0.03em] text-zinc-950 tabular-nums md:text-5xl">
								58<span className="text-blue-600">%</span>
							</p>
							<div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
								<span className="w-[58%] rounded-full bg-blue-600" />
							</div>
							<p className="mt-3 text-[13px]/5 text-zinc-600 md:text-sm/6">
								of answers mention {BRAND}, measured on a schedule across every engine you track.
							</p>
						</div>
					}
				/>

				<Row
					label="Where do we rank?"
					hint="Your position in each engine's list."
					without={
						<ul className="space-y-2">
							{RANKS.map((r) => (
								<li key={r.engine} className="flex items-center gap-2 text-[13px] text-zinc-400 md:text-sm">
									<EngineIcon name={r.engine} className="text-zinc-300" />
									<span className="truncate">{r.label}</span>
									<span className="ml-auto font-mono text-zinc-300">?</span>
								</li>
							))}
						</ul>
					}
					withElmo={
						<ul className="space-y-2">
							{RANKS.map((r) => (
								<li key={r.engine} className="flex items-center gap-2 text-[13px] text-zinc-800 md:text-sm">
									<EngineIcon name={r.engine} className="text-zinc-900" />
									<span className="truncate">{r.label}</span>
									{r.rank ? (
										<span className="ml-auto font-mono text-[12px] font-medium tabular-nums text-zinc-950">
											#{r.rank}
										</span>
									) : (
										<span className="ml-auto whitespace-nowrap rounded bg-rose-50 px-1.5 py-px text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
											Missing
										</span>
									)}
								</li>
							))}
						</ul>
					}
				/>

				<Row
					label="Who does AI trust?"
					hint="The pages the answers cite."
					without={
						<ul className="space-y-2.5" aria-label="Unknown sources">
							{[70, 52, 36].map((w) => (
								<li key={w} className="flex items-center gap-2">
									<span
										className="h-4 rounded border border-dashed border-zinc-300"
										style={{ width: `${w}%` }}
										aria-hidden="true"
									/>
									<span className="ml-auto font-mono text-[12px] text-zinc-300">?</span>
								</li>
							))}
						</ul>
					}
					withElmo={
						<ul className="space-y-2.5">
							{SOURCES.map((s) => (
								<li key={s.domain} className="text-[13px] md:text-sm">
									<div className="flex items-center gap-2">
										<span className="truncate font-mono text-[12px] text-zinc-800 md:text-[13px]">{s.domain}</span>
										<span className="ml-auto font-mono text-[12px] tabular-nums text-zinc-500">{s.share}%</span>
									</div>
									<div className="mt-1 h-1 rounded-full bg-zinc-100" aria-hidden="true">
										<div
											className={`h-full rounded-full ${s.domain === "tallypine.com" ? "bg-blue-600" : "bg-zinc-800"}`}
											style={{ width: `${s.share * 2.4}%` }}
										/>
									</div>
								</li>
							))}
						</ul>
					}
				/>

				<Row
					label="What should we do?"
					hint="The next move, ranked by impact."
					without={
						<p className="text-lg/7 font-medium tracking-[-0.01em] text-zinc-300 md:text-xl/8">
							Guess, publish, and hope.
						</p>
					}
					withElmo={
						<div className="rounded-lg bg-white p-3 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_8px_24px_-12px_rgb(37_99_235/0.25)] md:p-4">
							<p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
								<span className="rounded-sm bg-blue-50 px-1.5 py-0.5 text-blue-700">High impact</span>
								<span className="hidden sm:inline">Pitch</span>
							</p>
							<p className="mt-2 text-[13px]/5 font-medium text-zinc-950 md:text-[15px]/6">
								Get listed in capterra.com's invoicing roundup
							</p>
							<p className="mt-1 text-[12px]/5 text-zinc-600 md:text-[13px]/5">
								Gemini cites it for this prompt, and {BRAND} isn't in it.
							</p>
						</div>
					}
				/>
				<div className="border-t border-zinc-200" />
			</div>

			<a
				href="#features"
				className="group mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-zinc-700 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
			>
				See everything Elmo tracks
				<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
			</a>
		</section>
	);
}
