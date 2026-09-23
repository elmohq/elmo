import { Globe, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Logo } from "@/components/logo";
import { ModelIcon } from "./models";
import { InkLink, REPO_URL, repoFile } from "./ui";

// Everything in this specimen is illustrative. Marlowe, Vantaro and Brasswell
// are made-up espresso brands, so nobody reads it as a customer's real data.
// The arithmetic is real, though: every figure follows from the counts shown.

const BRAND = "Marlowe";
const QUESTION = "What's the best espresso machine for a beginner?";
const SOURCES = ["reddit.com", "youtube.com", "brasswell.com", "marlowe.com", "vantaro.com"];
const TALLY = ["+1 sampled", "+1 mentions you", "+3 brand mentions", "+5 citations"];
const SEARCHES = ["best espresso machine for beginners", "espresso machine built-in grinder review"];

const PLATFORMS = ["ChatGPT", "Perplexity", "Gemini", "Google AI Mode"];
const RUNS_PER_DAY = 4;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PER_DAY = PLATFORMS.length * RUNS_PER_DAY;
const SAMPLED = PER_DAY * DAYS.length;
const SLOT_IDS = Array.from({ length: PER_DAY }, (_, i) => `slot-${i}`);

// Answers per day that named Marlowe; they sum to the visibility numerator.
const HITS_BY_DAY = [5, 6, 7, 6, 7, 8, 7];
const MENTIONED = HITS_BY_DAY.reduce((a, b) => a + b, 0);

const SOV = [
	{ name: "Vantaro", mentions: 88, you: false },
	{ name: "Brasswell", mentions: 61, you: false },
	{ name: BRAND, mentions: MENTIONED, you: true },
];
const ALL_MENTIONS = SOV.reduce((a, b) => a + b.mentions, 0);
const pct = (n: number, d: number) => Math.round((n / d) * 100);

const TOP_DOMAINS = [
	{ domain: "reddit.com", count: 41, category: "Social" },
	{ domain: "vantaro.com", count: 33, category: "Competitor" },
	{ domain: "youtube.com", count: 26, category: "Social" },
	{ domain: "marlowe.com", count: 7, category: "Your brand" },
];

/** Which slots in a day's row are filled: spread the hits out deterministically so the matrix reads as sampled, not sorted. */
function hitSlots(day: number, hits: number) {
	const slots = new Set<number>();
	let k = day * 7 + 3;
	while (slots.size < hits) {
		k = (k * 37 + 11) % PER_DAY;
		slots.add(k);
	}
	return slots;
}

const specimenCss = `
@media (prefers-reduced-motion: no-preference) {
	.j-dot { animation: j-dot .35s ease-out both; }
	.j-bar { transform-origin: left; animation: j-bar .9s cubic-bezier(.2,.8,.2,1) both; }
}
@keyframes j-dot { from { opacity: 0; transform: scale(.4); } }
@keyframes j-bar { from { transform: scaleX(0); } }
`;

function Cite({ n }: { n: number }) {
	return (
		<sup className="ml-0.5 font-mono text-[10px] font-medium text-stone-500">
			<span className="sr-only">source </span>[{n}]
		</sup>
	);
}

function Competitor({ children }: { children: string }) {
	return (
		<span className="relative whitespace-nowrap">
			<strong className="rounded-[3px] px-1 py-px font-semibold text-[#1c1a17] outline outline-1 -outline-offset-1 outline-[#1c1a17]/35 [outline-style:dashed]">
				{children}
			</strong>
			<span className="ml-1 align-[2px] font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">
				<span className="sr-only">tagged as </span>comp
			</span>
		</span>
	);
}

function You({ children }: { children: string }) {
	return (
		<span className="whitespace-nowrap">
			<strong className="rounded-[3px] bg-blue-600/10 px-1 py-px font-semibold text-blue-700 ring-1 ring-blue-600/50">
				{children}
			</strong>
			<span className="ml-1 align-[2px] font-mono text-[9px] uppercase tracking-[0.12em] text-blue-700">
				<span className="sr-only">tagged as </span>you
			</span>
		</span>
	);
}

function AnswerPane() {
	return (
		<div className="flex flex-col">
			<div className="flex min-h-[3.25rem] flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#1c1a17]/10 px-5 py-3 sm:px-7">
				<span className="inline-flex items-center gap-2 text-sm font-medium text-[#1c1a17]">
					<ModelIcon name="ChatGPT" className="size-4" />
					ChatGPT
				</span>
				<span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-stone-600">
					chatgpt.com · product UI · run 3 of 4 today
				</span>
			</div>

			<div className="flex-1 px-5 pb-7 pt-6 sm:px-7">
				<div className="flex justify-end">
					<p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#efece4] px-4 py-2.5 text-[15px]/6 text-[#1c1a17]">
						{QUESTION}
					</p>
				</div>
				<p className="mt-5 inline-flex items-center gap-2 text-[13px] text-stone-600">
					<Globe className="size-3.5" aria-hidden="true" />
					Searched {SOURCES.length} sites
				</p>
				<div className="mt-3 text-[15px]/[1.75] text-stone-700 sm:text-[16px]/[1.8]">
					<p>For someone new to espresso, three machines come up most often:</p>
					<ol className="mt-2.5 space-y-2.5">
						<li className="flex gap-2.5">
							<span className="w-4 shrink-0 font-mono text-[13px]/7 text-stone-400">1.</span>
							<span>
								<Competitor>Vantaro Uno</Competitor> — a built-in grinder and guided dosing make it the easiest to
								learn.
								<span className="whitespace-nowrap">
									<Cite n={1} />
									<Cite n={2} />
								</span>
							</span>
						</li>
						<li className="flex gap-2.5">
							<span className="w-4 shrink-0 font-mono text-[13px]/7 text-stone-400">2.</span>
							<span>
								<Competitor>Brasswell Classic</Competitor> — a steel workhorse that rewards practice and lasts for
								years.
								<Cite n={3} />
							</span>
						</li>
						<li className="flex gap-2.5">
							<span className="w-4 shrink-0 font-mono text-[13px]/7 text-stone-400">3.</span>
							<span>
								<You>Marlowe Mini</You> — compact and quick to heat, a good fit for small kitchens.
								<span className="whitespace-nowrap">
									<Cite n={2} />
									<Cite n={4} />
								</span>
							</span>
						</li>
					</ol>
					<p className="mt-3">
						If you want one machine that grows with you, reviewers most often point to the Vantaro Uno.
						<Cite n={5} />
					</p>
				</div>
				<ul
					aria-label="Legend"
					className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dashed border-[#1c1a17]/15 pt-4 text-[12px] text-stone-600"
				>
					<li className="inline-flex items-center gap-2">
						<span aria-hidden="true" className="h-3.5 w-5 rounded-[3px] bg-blue-600/10 ring-1 ring-blue-600/50" />
						Your brand
					</li>
					<li className="inline-flex items-center gap-2">
						<span
							aria-hidden="true"
							className="h-3.5 w-5 rounded-[3px] outline outline-1 -outline-offset-1 outline-[#1c1a17]/35 [outline-style:dashed]"
						/>
						Tracked competitor
					</li>
					<li className="inline-flex items-center gap-2">
						<span aria-hidden="true" className="font-mono text-[10px] text-stone-500">
							[n]
						</span>
						Cited source
					</li>
					<li className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">Tagged by Elmo</li>
				</ul>
			</div>

			<div className="hidden border-t border-[#1c1a17]/10 bg-[#fbfaf7] px-5 py-5 sm:block sm:px-7">
				<p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-stone-600">
					What Elmo kept from this run
				</p>
				<dl className="mt-3 grid gap-y-2.5 text-[13px] sm:grid-cols-[7.5rem_1fr]">
					<dt className="text-stone-500">Your brand</dt>
					<dd className="text-[#1c1a17]">
						<span className="font-medium text-blue-700">{BRAND}</span> — mentioned
					</dd>
					<dt className="text-stone-500">Competitors</dt>
					<dd className="text-[#1c1a17]">Vantaro, Brasswell</dd>
					<dt className="text-stone-500">Sources</dt>
					<dd>
						<ol className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px] text-stone-600">
							{SOURCES.map((src, i) => (
								<li key={src} className={src === "marlowe.com" ? "text-blue-700" : ""}>
									<span className="text-stone-400">[{i + 1}]</span> {src}
								</li>
							))}
						</ol>
					</dd>
					<dt className="text-stone-500">Adds to totals</dt>
					<dd className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px] text-[#1c1a17]">
						{TALLY.map((t) => (
							<span key={t}>{t}</span>
						))}
					</dd>
					<dt className="text-stone-500">Searches run</dt>
					<dd className="flex flex-wrap gap-1.5">
						{SEARCHES.map((q) => (
							<span key={q} className="rounded-sm bg-[#efece4] px-1.5 py-0.5 font-mono text-[11px] text-stone-700">
								{q}
							</span>
						))}
					</dd>
				</dl>
			</div>
		</div>
	);
}

interface MetricProps {
	id: string;
	label: string;
	value: React.ReactNode;
	fraction: React.ReactNode;
	open: boolean;
	onToggle: () => void;
	children?: React.ReactNode;
	method: React.ReactNode;
	compact?: boolean;
}

function Metric({ id, label, value, fraction, open, onToggle, children, method, compact = false }: MetricProps) {
	const panelId = `${id}-method`;
	return (
		<div
			className={`border-t border-[#1c1a17]/10 px-5 first:border-t-0 sm:px-6 ${compact ? "bg-[#f8f6f0] py-3" : "py-4"}`}
		>
			<div className="flex items-center justify-between gap-3">
				<p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-stone-600">{label}</p>
				<button
					type="button"
					aria-expanded={open}
					aria-controls={panelId}
					onClick={onToggle}
					className="group inline-flex h-6 items-center gap-1.5 rounded-full pl-2 pr-1 text-[11.5px] font-medium text-stone-600 ring-1 ring-[#1c1a17]/12 transition-colors hover:text-[#1c1a17] hover:ring-[#1c1a17]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-expanded:bg-[#1c1a17] aria-expanded:text-white aria-expanded:ring-[#1c1a17]"
				>
					How it's measured
					<span className="inline-flex size-4 items-center justify-center rounded-full bg-[#1c1a17]/6 transition-transform group-aria-expanded:rotate-45 group-aria-expanded:bg-white/15">
						<Plus className="size-2.5" strokeWidth={2.5} aria-hidden="true" />
					</span>
				</button>
			</div>
			<div className={`flex items-baseline gap-3 ${compact ? "mt-1" : "mt-2"}`}>
				<span
					className={`font-semibold leading-none text-[#1c1a17] tabular-nums ${compact ? "text-[1.375rem] tracking-[-0.03em]" : "text-[2.375rem] tracking-[-0.04em]"}`}
				>
					{value}
				</span>
				<span className="text-[13px]/5 text-stone-600">{fraction}</span>
			</div>
			{children ? <div className="mt-3">{children}</div> : null}
			<div
				id={panelId}
				inert={!open}
				className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
			>
				<div className="overflow-hidden">
					<div className="mt-4 rounded-md bg-[#f4f1ea] p-3.5 text-[12.5px]/5 text-stone-700 ring-1 ring-[#1c1a17]/8">
						{method}
					</div>
				</div>
			</div>
		</div>
	);
}

function Formula({ children }: { children: React.ReactNode }) {
	return <p className="font-mono text-[12px]/5 text-[#1c1a17]">{children}</p>;
}

function CodeRef({ path, label }: { path: string; label: string }) {
	return (
		<InkLink href={repoFile(path)} className="mt-2.5 font-mono text-[11.5px]">
			{label}
		</InkLink>
	);
}

function DayMatrix() {
	return (
		<div role="img" aria-label={`${MENTIONED} of ${SAMPLED} sampled answers mention ${BRAND}, shown day by day`}>
			<div className="grid gap-1" aria-hidden="true">
				{DAYS.map((day, d) => {
					const slots = hitSlots(d, HITS_BY_DAY[d]);
					return (
						<div key={day} className="flex items-center gap-2">
							<span className="w-7 font-mono text-[9.5px] uppercase tracking-[0.08em] text-stone-500">{day}</span>
							<div className="flex gap-[4px]">
								{SLOT_IDS.map((slot, i) => {
									const hit = slots.has(i);
									return (
										<span
											key={slot}
											className={`j-dot size-[7px] rounded-full ${hit ? "bg-blue-600" : "ring-1 ring-inset ring-stone-300"} ${i % RUNS_PER_DAY === 0 && i > 0 ? "ml-[3px]" : ""}`}
											style={{ animationDelay: `${300 + d * 60 + i * 12}ms` }}
										/>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
			<p className="mt-2 pl-9 font-mono text-[9.5px] uppercase tracking-[0.08em] text-stone-500" aria-hidden="true">
				{PLATFORMS.length} platforms × {RUNS_PER_DAY} runs a day
			</p>
		</div>
	);
}

function SovBar() {
	return (
		<div>
			<div className="flex h-2.5 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
				{SOV.map((s) => (
					<span
						key={s.name}
						className={`j-bar h-full border-r border-white last:border-r-0 ${s.you ? "bg-blue-600" : s.name === "Vantaro" ? "bg-[#1c1a17]" : "bg-stone-400"}`}
						style={{ width: `${(s.mentions / ALL_MENTIONS) * 100}%` }}
					/>
				))}
			</div>
			<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-stone-600">
				{SOV.map((s) => (
					<li key={s.name} className={`tabular-nums ${s.you ? "font-medium text-blue-700" : ""}`}>
						{s.name} {pct(s.mentions, ALL_MENTIONS)}%<span className="text-stone-400"> · {s.mentions}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function DomainList() {
	const max = TOP_DOMAINS[0].count;
	return (
		<ul className="space-y-1.5">
			{TOP_DOMAINS.map((d) => {
				const you = d.category === "Your brand";
				return (
					<li key={d.domain} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-[12px]">
						<span className={`truncate font-mono ${you ? "text-blue-700" : "text-stone-700"}`}>{d.domain}</span>
						<span className="flex items-center gap-2">
							<span
								aria-hidden="true"
								className={`j-bar h-1.5 rounded-full ${you ? "bg-blue-600" : "bg-stone-300"}`}
								style={{ width: `${(d.count / max) * 100}%` }}
							/>
							<span className="shrink-0 text-[10.5px] text-stone-500">{d.category}</span>
						</span>
						<span className="text-right font-mono tabular-nums text-stone-700">{d.count}</span>
					</li>
				);
			})}
		</ul>
	);
}

function Readout() {
	const baseId = useId();
	const [open, setOpen] = useState<Record<string, boolean>>({ visibility: true });
	const toggle = (key: string) => () => setOpen((o) => ({ ...o, [key]: !o[key] }));

	return (
		<div className="flex flex-col bg-[#fdfcf9]">
			<div className="flex min-h-[3.25rem] items-center justify-between gap-3 border-b border-[#1c1a17]/10 px-5 py-3 sm:px-6">
				<span className="inline-flex items-baseline gap-2">
					<Logo className="text-[1.15rem]" />
					<span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-stone-600">readout</span>
				</span>
				<span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-stone-600">{BRAND} · last 7 days</span>
			</div>

			<div className="flex-1">
				<Metric
					id={`${baseId}-sample`}
					label="Sample"
					value={SAMPLED}
					fraction={
						<span className="inline-flex flex-wrap items-center gap-x-2">
							answers · {PLATFORMS.length} platforms × {RUNS_PER_DAY}/day × {DAYS.length} days
							<span className="inline-flex items-center gap-1.5 text-stone-500">
								{PLATFORMS.map((p) => (
									<ModelIcon key={p} name={p} className="size-3" />
								))}
							</span>
						</span>
					}
					compact
					open={!!open.sample}
					onToggle={toggle("sample")}
					method={
						<>
							<p>
								ChatGPT, Perplexity, Gemini and Google AI Mode are read from the product your buyers use, through a
								scraping provider — not approximated with a model API.
							</p>
							<p className="mt-1.5">
								Each prompt is asked up to 4× a day on Basic plans and above (1× on Starter), because the same question
								gets different answers from run to run.
							</p>
							<CodeRef path="packages/config/src/plans.ts" label="plans.ts — sampling per plan" />
						</>
					}
				/>

				<Metric
					id={`${baseId}-visibility`}
					label="Visibility"
					value={`${pct(MENTIONED, SAMPLED)}%`}
					fraction={
						<>
							<span className="font-medium text-[#1c1a17] tabular-nums">
								{MENTIONED} of {SAMPLED}
							</span>{" "}
							answers mention {BRAND}
						</>
					}
					open={!!open.visibility}
					onToggle={toggle("visibility")}
					method={
						<>
							<Formula>visibility = answers mentioning you ÷ answers sampled</Formula>
							<p className="mt-1.5">
								A mention is a case-insensitive match on your brand name, its aliases, or your domain — the same rule
								for you and every competitor.
							</p>
							<CodeRef path="packages/lib/src/mentions.ts" label="mentions.ts — the matching rule" />
						</>
					}
				>
					<DayMatrix />
				</Metric>

				<Metric
					id={`${baseId}-sov`}
					label="Share of voice"
					value={`${pct(MENTIONED, ALL_MENTIONS)}%`}
					fraction={
						<>
							<span className="font-medium text-[#1c1a17] tabular-nums">
								{MENTIONED} of {ALL_MENTIONS}
							</span>{" "}
							brand mentions are {BRAND}
						</>
					}
					open={!!open.sov}
					onToggle={toggle("sov")}
					method={
						<>
							<Formula>share of voice = your mentions ÷ (yours + tracked competitors')</Formula>
							<p className="mt-1.5">Only competitors you've chosen to track count toward the total.</p>
							<CodeRef path="packages/lib/src/report-metrics.ts" label="report-metrics.ts — computeOverallSoV" />
						</>
					}
				>
					<SovBar />
				</Metric>

				<Metric
					id={`${baseId}-citations`}
					label="Citations"
					value={TOP_DOMAINS[3].count}
					fraction={<>times these answers cited marlowe.com</>}
					open={!!open.citations}
					onToggle={toggle("citations")}
					method={
						<>
							<p>
								Every URL an answer cites is stored with the run, then its domain is sorted into a category: your brand,
								competitors, editorial, reviews, social, and more.
							</p>
							<CodeRef path="apps/web/src/lib/domain-categories.ts" label="domain-categories.ts" />
						</>
					}
				>
					<DomainList />
				</Metric>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#1c1a17]/10 bg-[#f4f1ea] px-5 py-3 sm:px-6">
				<p className="text-[12px] text-stone-600">Open any prompt to read the answers behind it.</p>
				<InkLink href={REPO_URL} className="text-[12.5px]">
					Read the scoring code
				</InkLink>
			</div>
		</div>
	);
}

/** Fig. 1: one real-shaped AI answer, tagged the way Elmo reads it, beside the counts it rolls up into. */
export function Specimen() {
	return (
		<figure>
			<style>{specimenCss}</style>
			<div className="grid overflow-hidden rounded-xl bg-white ring-1 ring-[#1c1a17]/15 shadow-[0_1px_0_rgb(28_26_23/0.04),0_30px_60px_-30px_rgb(28_26_23/0.25)] lg:grid-cols-[1.08fr_1fr]">
				<AnswerPane />
				<div className="border-t border-[#1c1a17]/12 lg:border-l lg:border-t-0">
					<Readout />
				</div>
			</div>
			<figcaption className="mt-4 flex flex-col gap-2 text-[12.5px] text-stone-600 sm:flex-row sm:items-start sm:justify-between">
				<span>
					<span className="font-mono uppercase tracking-[0.14em] text-[#1c1a17]">Fig. 1</span>
					<span className="mx-2 text-stone-300" aria-hidden="true">
						—
					</span>
					One answer, tagged the way Elmo reads it, and the week of samples it rolls up into.
				</span>
				<span className="shrink-0">
					<span className="rounded-sm bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-900">
						Example
					</span>{" "}
					Marlowe, Vantaro and Brasswell are fictional.
				</span>
			</figcaption>
		</figure>
	);
}
