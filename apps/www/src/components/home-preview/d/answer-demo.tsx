import { ArrowRight, ChevronDown, Globe, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { MODELS } from "./models";

// Everything in this demo is illustrative. Fernbrook, YardDesk, Mowmentum and
// GreenLedger are made-up brands so nobody reads it as a real customer's data.

const BRAND = "Fernbrook";
const QUESTION = "What's the best CRM for a small landscaping business?";

const SOURCES = ["reddit.com", "yarddesk.com", "capterra.com", "g2.com", "lawnsite.com"];

// The answer streams in with pure CSS: every word is rendered from the start
// (so the layout never jumps and the static/no-JS state is the finished
// answer) and each one gets a staggered animation delay.
const START_MS = 700;
const STEP_MS = 32;

let counter = 0;
const next = () => counter++;
const words = (s: string) => s.split(" ").map((w) => ({ w, i: next() }));

const INTRO = words("For a small landscaping business, three CRMs come up again and again:");
const ITEMS = [
	{
		brand: "YardDesk",
		rank: 1,
		text: "built for field crews, with route scheduling and on-site quotes.",
		cites: [1, 2],
	},
	{ brand: "Mowmentum", rank: 2, text: "the simplest pick for recurring visits and automatic invoicing.", cites: [3] },
	{ brand: "GreenLedger", rank: 3, text: "a general-purpose CRM with solid accounting sync.", cites: [4] },
].map((item) => ({
	...item,
	i: next(),
	words: words(item.text),
	cites: item.cites.map((n) => ({ n, i: next() })),
}));
const OUTRO = words("If scheduling is the priority, reviewers most often point to YardDesk.");
const OUTRO_CITE = { n: 5, i: next() };

const at = (i: number, extra = 0) => ({ animationDelay: `${START_MS + i * STEP_MS + extra}ms` });
const END = counter;

const demoCss = `
.d-think { display: none; }
@media (prefers-reduced-motion: no-preference) {
	.d-tok { opacity: 0; filter: blur(3px); animation: d-tok .28s ease-out forwards; }
	.d-tag { opacity: 0; transform: scale(.85); animation: d-tag .35s cubic-bezier(.3,1.3,.5,1) forwards; }
	.d-pop { opacity: 0; transform: scale(.6); animation: d-tag .3s cubic-bezier(.3,1.5,.5,1) forwards; }
	.d-fade { opacity: 0; animation: d-fade .45s ease-out forwards; }
	.d-slide { opacity: 0; transform: translateY(24px) scale(.97); animation: d-slide .7s cubic-bezier(.2,.8,.2,1) forwards; }
	.d-think { display: inline-flex; animation: d-out .2s ease-in forwards; }
	.d-shimmer { background: linear-gradient(90deg, #71717a 0%, #71717a 40%, #d4d4d8 50%, #71717a 60%, #71717a 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: d-shimmer 1.2s linear infinite; }
}
@keyframes d-tok { to { opacity: 1; filter: blur(0); } }
@keyframes d-tag { to { opacity: 1; transform: scale(1); } }
@keyframes d-fade { to { opacity: 1; } }
@keyframes d-slide { to { opacity: 1; transform: none; } }
@keyframes d-out { to { opacity: 0; visibility: hidden; } }
@keyframes d-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
`;

function Words({ list }: { list: { w: string; i: number }[] }) {
	return list.map(({ w, i }) => (
		<span key={i} className="d-tok" style={at(i)}>
			{w}{" "}
		</span>
	));
}

function Cite({ n, i }: { n: number; i: number }) {
	return (
		<span
			className="d-pop mx-px inline-flex size-[18px] translate-y-[-1px] items-center justify-center rounded-full bg-zinc-100 align-middle font-mono text-[10px] text-zinc-600 ring-1 ring-zinc-200"
			style={at(i)}
		>
			<span className="sr-only">source </span>
			{n}
		</span>
	);
}

function Competitor({ brand, rank, i }: { brand: string; rank: number; i: number }) {
	return (
		<>
			<span className="relative inline-block">
				<span
					aria-hidden="true"
					className="d-tag absolute -inset-x-1 -inset-y-px rounded-md bg-amber-100/80 ring-1 ring-amber-300/80"
					style={at(i, 220)}
				/>
				<strong className="d-tok relative font-semibold text-zinc-950" style={at(i)}>
					{brand}
				</strong>
			</span>
			<span
				className="d-pop ml-1.5 mr-1 inline-flex h-[18px] translate-y-[-1px] items-center gap-1 rounded-md bg-amber-500 px-1.5 align-middle font-mono text-[10px] font-medium text-white shadow-sm shadow-amber-600/30"
				style={at(i, 380)}
			>
				<span className="sr-only">competitor, ranked </span>#{rank}
			</span>
		</>
	);
}

function AnswerWindow({ onReplay }: { onReplay: () => void }) {
	const ChatGPTIcon = MODELS[0].icon;
	return (
		<div className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_32px_64px_-24px_rgb(37_99_235/0.28)]">
			<div className="flex h-12 items-center gap-3 border-b border-zinc-100 px-4">
				<span className="inline-flex h-7 items-center gap-2 rounded-lg px-2 text-sm font-medium text-zinc-900 ring-1 ring-zinc-200">
					<span className="size-4 text-zinc-900">
						<ChatGPTIcon />
					</span>
					ChatGPT
					<ChevronDown className="size-3.5 text-zinc-400" aria-hidden="true" />
				</span>
				<span aria-hidden="true" className="hidden items-center gap-2.5 text-zinc-300 sm:flex">
					{MODELS.slice(1, 6).map((m) => (
						<span key={m.name} className="size-3.5">
							<m.icon />
						</span>
					))}
				</span>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={onReplay}
						className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-600 motion-reduce:hidden"
					>
						<RotateCcw className="size-3" aria-hidden="true" />
						Replay
					</button>
					<span className="inline-flex h-6 items-center rounded-md bg-amber-50 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-200">
						Example
					</span>
				</div>
			</div>

			<div className="px-5 pb-14 pt-5 sm:px-7 sm:pb-16">
				<div className="flex justify-end">
					<p className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-[15px]/6 text-zinc-900">
						{QUESTION}
					</p>
				</div>

				<div className="mt-5 grid text-[13px] text-zinc-500 [&>*]:col-start-1 [&>*]:row-start-1">
					<span className="d-think items-center gap-2" style={{ animationDelay: `${START_MS - 150}ms` }}>
						<Globe className="size-3.5" aria-hidden="true" />
						<span className="d-shimmer">Searching the web…</span>
					</span>
					<span className="d-fade inline-flex items-center gap-2" style={{ animationDelay: `${START_MS - 80}ms` }}>
						<Globe className="size-3.5" aria-hidden="true" />
						Searched {SOURCES.length} sites
					</span>
				</div>

				<div className="mt-3 text-[15px]/7 text-zinc-700">
					<p>
						<Words list={INTRO} />
					</p>
					<ol className="mt-2.5 space-y-2">
						{ITEMS.map((item) => (
							<li key={item.brand} className="flex gap-2.5">
								<span className="d-tok w-4 shrink-0 font-mono text-[13px]/7 text-zinc-400" style={at(item.i)}>
									{item.rank}.
								</span>
								<span>
									<Competitor brand={item.brand} rank={item.rank} i={item.i} />
									<span className="d-tok" style={at(item.i)}>
										—{" "}
									</span>
									<Words list={item.words.slice(0, -1)} />
									<span className="whitespace-nowrap">
										<Words list={item.words.slice(-1)} />
										{item.cites.map((c) => (
											<Cite key={c.n} {...c} />
										))}
									</span>
								</span>
							</li>
						))}
					</ol>
					<p className="mt-3">
						<Words list={OUTRO.slice(0, -1)} />
						<span className="whitespace-nowrap">
							<Words list={OUTRO.slice(-1)} />
							<Cite {...OUTRO_CITE} />
						</span>
					</p>
				</div>

				<div className="d-fade mt-5 flex flex-wrap items-center gap-1.5" style={at(END, 100)}>
					<span className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Sources</span>
					{SOURCES.map((s, idx) => (
						<span
							key={s}
							className="inline-flex h-6 items-center gap-1.5 rounded-full bg-zinc-50 pl-1 pr-2.5 text-[12px] text-zinc-600 ring-1 ring-zinc-200"
						>
							<span className="inline-flex size-4 items-center justify-center rounded-full bg-white font-mono text-[9px] text-zinc-500 ring-1 ring-zinc-200">
								{idx + 1}
							</span>
							{s}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

function ElmoVerdict() {
	return (
		<div
			className="d-slide w-full overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_24px_48px_-12px_rgb(9_9_11/0.45)]"
			style={at(END, 450)}
		>
			<div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
				<div className="flex items-center gap-2.5">
					<Logo className="text-xl leading-none text-blue-400" />
					<span className="whitespace-nowrap text-[13px] text-zinc-400">read this answer</span>
				</div>
				<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
					<span className="hidden sm:inline">Tracking · </span>
					{BRAND}
				</span>
			</div>
			<div className="px-5 pb-5 pt-4">
				<p className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
					<span className="inline-flex size-5 items-center justify-center rounded-full bg-rose-500/15 text-rose-400 ring-1 ring-rose-400/30">
						<X className="size-3" strokeWidth={3} aria-hidden="true" />
					</span>
					You weren't mentioned.
				</p>
				<dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/10">
					{[
						{ n: "0", label: `mentions of ${BRAND}`, cls: "text-rose-400" },
						{ n: "3", label: "competitors named", cls: "text-amber-400" },
						{ n: String(SOURCES.length), label: "sources cited", cls: "text-blue-400" },
					].map((s) => (
						<div key={s.label} className="flex flex-col-reverse bg-zinc-950 px-3 py-3">
							<dt className="mt-1 text-[12px] leading-tight text-zinc-400">{s.label}</dt>
							<dd className={`text-2xl font-semibold tabular-nums tracking-tight ${s.cls}`}>{s.n}</dd>
						</div>
					))}
				</dl>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
					<p className="min-w-0 basis-full text-balance sm:basis-auto sm:flex-1 text-[13px]/5 text-zinc-400">
						<span className="text-zinc-200">Top opportunity:</span> get into the capterra.com roundup this answer cites.
					</p>
					<a
						href="#features"
						className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-blue-600 pl-3.5 pr-3 text-[13px] font-medium text-white shadow-[0_0_0_1px_rgb(96_165_250/0.4),0_6px_16px_-4px_rgb(37_99_235/0.7)] transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
					>
						See how to fix it
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
					</a>
				</div>
			</div>
		</div>
	);
}

/**
 * The hero's "live" AI answer: a question streams into an answer that names
 * three competitors, Elmo tags them, then its verdict slides in over the corner.
 */
export function AnswerDemo() {
	const [run, setRun] = useState(0);
	return (
		<figure
			key={run}
			className="relative"
			aria-label={`Illustrative example: an AI answer to "${QUESTION}" names three competitors but not ${BRAND}, and Elmo flags it.`}
		>
			<style>{demoCss}</style>
			<AnswerWindow onReplay={() => setRun((r) => r + 1)} />
			<div className="relative z-10 -mt-10 px-3 sm:px-8 lg:-ml-10 lg:mr-20 lg:px-0">
				<ElmoVerdict />
			</div>
		</figure>
	);
}
