import { ArrowDown, ArrowRight, RefreshCw } from "lucide-react";
import { EngineIcon } from "./engines";
import { delay } from "./styles";
import { CARD, ExampleTag } from "./ui";

const BRAND = "Loftwell";

const ENGINES = [
	{ name: "ChatGPT", iconId: "openai" },
	{ name: "AI Overviews", iconId: "google" },
	{ name: "Gemini", iconId: "gemini" },
	{ name: "Perplexity", iconId: "perplexity" },
	{ name: "Claude", iconId: "anthropic" },
];

// Kept consistent with each other: 3 of 10 answers is the 30% below.
const LEADERBOARD = [
	{ name: "Uplane", share: 62 },
	{ name: "Deskhaven", share: 48 },
	{ name: BRAND, share: 30, you: true },
];

const LABEL = "text-[13px] font-medium text-zinc-500";

function StepHeader({ n, title, body, className }: { n: number; title: string; body: string; className: string }) {
	return (
		<div className={`home-rise flex items-start gap-3 ${className}`} style={delay(n * 140)}>
			<span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white tabular-nums">
				{n}
			</span>
			<div>
				<h3 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">{title}</h3>
				<p className="mt-0.5 text-pretty text-[15px]/6 text-zinc-600">{body}</p>
			</div>
		</div>
	);
}

function StepCard({ n, className, children }: { n: number; className: string; children: React.ReactNode }) {
	return (
		<div className={`home-rise flex flex-col p-6 ${CARD} ${className}`} style={delay(n * 140 + 60)}>
			{children}
		</div>
	);
}

function Connector({ className }: { className: string }) {
	return (
		<div aria-hidden="true" className={`flex items-center justify-center ${className}`}>
			<span className="inline-flex size-9 items-center justify-center rounded-full bg-white text-blue-600 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_4px_12px_-4px_rgb(37_99_235/0.3)]">
				<ArrowRight className="hidden size-4 lg:block" strokeWidth={2.25} />
				<ArrowDown className="size-4 lg:hidden" strokeWidth={2.25} />
			</span>
		</div>
	);
}

function AskCard() {
	return (
		<StepCard n={1} className="lg:col-start-1 lg:row-start-2">
			<p className={LABEL}>Your buyer asks</p>
			<p className="mt-2.5 rounded-2xl rounded-tl-md bg-zinc-100/80 px-4 py-3.5 text-[17px]/7 font-medium text-pretty text-zinc-950">
				What's the best standing desk for a small home office?
			</p>
			<p className={`${LABEL} mt-6`}>Elmo asks it on</p>
			<ul className="mt-2.5 flex flex-wrap gap-1.5">
				{ENGINES.map((e) => (
					<li
						key={e.name}
						className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-2.5 text-[13px] font-medium text-zinc-800 ring-1 ring-zinc-200"
					>
						<EngineIcon iconId={e.iconId} className="size-3.5 text-zinc-900" />
						{e.name}
					</li>
				))}
			</ul>
		</StepCard>
	);
}

function MeasureCard() {
	return (
		<StepCard n={2} className="lg:col-start-3 lg:row-start-2">
			<p className={LABEL}>Answers that name {BRAND}</p>
			<p className="mt-1 flex items-baseline gap-2">
				<span className="text-5xl font-semibold tracking-[-0.04em] text-zinc-950 tabular-nums">30%</span>
				<span className="text-[15px] text-zinc-500">3 of 10 answers</span>
			</p>
			<p className={`${LABEL} mt-6`}>Who AI recommends instead</p>
			<ol className="mt-3 space-y-3">
				{LEADERBOARD.map((b, i) => (
					<li key={b.name} className="grid grid-cols-[1.25rem_6.5rem_1fr_2.75rem] items-center gap-2 text-[15px]">
						<span className="text-zinc-400 tabular-nums">{i + 1}</span>
						<span className={`truncate ${b.you ? "font-semibold text-blue-600" : "font-medium text-zinc-900"}`}>
							{b.name}
						</span>
						<span className="h-2 overflow-hidden rounded-full bg-zinc-100">
							<span
								className={`home-grow block h-full rounded-full ${b.you ? "bg-blue-600" : "bg-zinc-300"}`}
								style={{ width: `${b.share}%`, ...delay(500 + i * 120) }}
							/>
						</span>
						<span className="text-right text-zinc-600 tabular-nums">{b.share}%</span>
					</li>
				))}
			</ol>
			<p className="mt-auto pt-4 text-[13px] text-zinc-500">Across 5 AI engines, last 7 days</p>
		</StepCard>
	);
}

function ImproveCard() {
	return (
		<StepCard n={3} className="lg:col-start-5 lg:row-start-2">
			<p className={LABEL}>Your next move</p>
			<div className="mt-2.5 rounded-xl bg-blue-50/70 p-4 ring-1 ring-blue-100">
				<span className="self-start rounded-full bg-blue-600 px-2 py-0.5 text-[12px] font-semibold text-white">
					High impact
				</span>
				<p className="mt-3 text-[17px]/6 font-semibold text-pretty text-zinc-950">
					Get into deskreviewlab.com's best-desks roundup
				</p>
				<p className="mt-2 text-pretty text-[15px]/6 text-zinc-600">
					AI cites it in 7 of 10 answers. It names Uplane and Deskhaven, not {BRAND}.
				</p>
			</div>
			<p className="mt-auto pt-4 text-[13px] text-zinc-500">Top of 12 ideas, ranked by likely impact</p>
		</StepCard>
	);
}

/**
 * The product in three steps, drawn as one example read left to right. Every
 * number is invented, and labelled so, because the point is the shape of the
 * loop rather than a result to believe.
 */
export function HeroFlow() {
	return (
		<div>
			<h2 className="sr-only">How Elmo works</h2>
			<ExampleTag>
				<span>
					<span className="font-medium text-zinc-700">{BRAND}</span> is a fictional standing-desk brand
				</span>
			</ExampleTag>
			<div className="mt-5 grid grid-cols-1 gap-y-4 lg:grid-cols-[1fr_2.75rem_1fr_2.75rem_1fr] lg:grid-rows-[auto_1fr] lg:gap-y-5">
				<StepHeader
					n={1}
					title="Ask"
					body="Elmo asks AI what your buyers ask."
					className="lg:col-start-1 lg:row-start-1"
				/>
				<AskCard />
				<Connector className="py-1 lg:col-start-2 lg:row-start-2 lg:py-0" />
				<StepHeader
					n={2}
					title="Measure"
					body="See if you're named, and who's winning."
					className="lg:col-start-3 lg:row-start-1"
				/>
				<MeasureCard />
				<Connector className="py-1 lg:col-start-4 lg:row-start-2 lg:py-0" />
				<StepHeader
					n={3}
					title="Improve"
					body="Get the change most likely to help."
					className="lg:col-start-5 lg:row-start-1"
				/>
				<ImproveCard />
			</div>
			<p className="home-rise mt-8 flex items-center justify-center gap-2 text-[15px] text-zinc-600" style={delay(700)}>
				<RefreshCw className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
				Elmo re-asks daily, so you see the answer change.
			</p>
		</div>
	);
}
