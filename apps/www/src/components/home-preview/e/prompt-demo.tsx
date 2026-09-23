import { ArrowUp, Check, Globe, Minus, Pause, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { MODELS } from "./models";

// Everything here is illustrative. "Tallyfox" and "Paybird" are made-up
// invoicing apps, so nobody mistakes the numbers for a real customer's results.

type Answer = { mentioned: boolean; rank?: number; source: string };

const ENGINES = [
	{ name: "ChatGPT", model: "ChatGPT" },
	{ name: "Claude", model: "Claude" },
	{ name: "Gemini", model: "Gemini" },
	{ name: "Perplexity", model: "Perplexity" },
	{ name: "AI Overviews", model: "Google AI Overviews" },
	{ name: "Copilot", model: "Copilot" },
] as const;

const PROMPTS: { text: string; chip: string; answers: Answer[] }[] = [
	{
		text: "What's the best invoicing app for freelancers?",
		chip: "Best invoicing app",
		answers: [
			{ mentioned: true, rank: 2, source: "reddit.com" },
			{ mentioned: true, rank: 1, source: "tallyfox.com" },
			{ mentioned: false, source: "youtube.com" },
			{ mentioned: true, rank: 3, source: "g2.com" },
			{ mentioned: true, rank: 2, source: "capterra.com" },
			{ mentioned: false, source: "paybird.com" },
		],
	},
	{
		text: "How do I get clients to pay my invoices on time?",
		chip: "Getting paid on time",
		answers: [
			{ mentioned: false, source: "reddit.com" },
			{ mentioned: true, rank: 3, source: "tallyfox.com" },
			{ mentioned: false, source: "youtube.com" },
			{ mentioned: true, rank: 2, source: "reddit.com" },
			{ mentioned: false, source: "paybird.com" },
			{ mentioned: false, source: "wikihow.com" },
		],
	},
	{
		text: "Tallyfox vs. Paybird: which one is cheaper?",
		chip: "Tallyfox vs. Paybird",
		answers: [
			{ mentioned: true, rank: 1, source: "tallyfox.com" },
			{ mentioned: true, rank: 1, source: "g2.com" },
			{ mentioned: true, rank: 2, source: "paybird.com" },
			{ mentioned: true, rank: 1, source: "reddit.com" },
			{ mentioned: true, rank: 2, source: "capterra.com" },
			{ mentioned: false, source: "paybird.com" },
		],
	},
	{
		text: "Simple invoicing software that handles VAT for EU clients",
		chip: "Invoicing with VAT",
		answers: [
			{ mentioned: true, rank: 4, source: "g2.com" },
			{ mentioned: false, source: "paybird.com" },
			{ mentioned: true, rank: 2, source: "tallyfox.com" },
			{ mentioned: false, source: "reddit.com" },
			{ mentioned: false, source: "capterra.com" },
			{ mentioned: true, rank: 3, source: "g2.com" },
		],
	},
];

type Phase = "typing" | "asking" | "shown" | "erasing";

const demoCss = `
@property --e-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
.e-ring { background: conic-gradient(from var(--e-angle), #2563eb, #7c3aed 22%, #06b6d4 45%, #2563eb 62%, #a5b4fc 80%, #2563eb); }
.e-caret { animation: e-blink 1.05s steps(1) infinite; }
@keyframes e-blink { 50% { opacity: 0; } }
@keyframes e-spin { to { --e-angle: 360deg; } }
@keyframes e-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes e-flow { to { stroke-dashoffset: -20; } }
@keyframes e-shimmer { 0% { background-position: 150% 0; } 100% { background-position: -50% 0; } }
.e-shimmer { background: linear-gradient(90deg, #f4f4f5 30%, #e4e4e7 50%, #f4f4f5 70%); background-size: 200% 100%; }
@media (prefers-reduced-motion: no-preference) {
	.e-ring { animation: e-spin 9s linear infinite; }
	.e-ring-fast { animation-duration: 2.4s; }
	.e-result { animation: e-in .45s cubic-bezier(.2,.7,.2,1) both; }
	.e-wire-flow { animation: e-flow .7s linear infinite; }
	.e-shimmer { animation: e-shimmer 1.2s linear infinite; }
}
@media (prefers-reduced-motion: reduce) { .e-caret { animation: none; } }
`;

function usePrefersReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mq.matches);
		const onChange = () => setReduced(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);
	return reduced;
}

function iconFor(model: string) {
	return MODELS.find((m) => m.name === model)?.icon ?? MODELS[0].icon;
}

// Where each card sits on the desktop arc: outer cards drop and tilt a little.
function fanStyle(i: number) {
	const offset = i - (ENGINES.length - 1) / 2;
	return {
		"--fan-r": `${offset * 1.5}deg`,
		"--fan-y": `${offset * offset * 3}px`,
	} as React.CSSProperties;
}

function Favicon({ domain }: { domain: string }) {
	const own = domain === "tallyfox.com";
	return (
		<span
			aria-hidden="true"
			className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] font-mono text-[9px] uppercase leading-none ${own ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200"}`}
		>
			{domain[0]}
		</span>
	);
}

function EngineCard({
	engine,
	answer,
	pending,
	resultKey,
	index,
}: {
	engine: (typeof ENGINES)[number];
	answer: Answer;
	pending: "idle" | "asking" | false;
	resultKey: number;
	index: number;
}) {
	const Icon = iconFor(engine.model);
	return (
		<li
			style={fanStyle(index)}
			className="lg:[transform:translateY(var(--fan-y))_rotate(var(--fan-r))] lg:transition-transform lg:duration-300 lg:hover:[transform:translateY(calc(var(--fan-y)-6px))_rotate(var(--fan-r))]"
		>
			<div
				className={`flex h-full flex-col rounded-2xl bg-white/90 p-3.5 backdrop-blur-sm transition-[box-shadow,opacity] duration-300 sm:p-4 ${
					!pending && answer.mentioned
						? "shadow-[0_0_0_1px_rgb(16_185_129/0.22),0_1px_2px_rgb(24_24_27/0.04),0_14px_30px_-14px_rgb(24_24_27/0.22)]"
						: "shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04),0_14px_30px_-14px_rgb(24_24_27/0.18)]"
				} ${pending === "idle" ? "opacity-60" : ""}`}
			>
				<div className="flex items-center gap-2">
					<span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-50 p-1 text-zinc-800 ring-1 ring-zinc-200/80">
						<Icon />
					</span>
					<span className="truncate text-[13px] font-semibold text-zinc-900">{engine.name}</span>
				</div>

				<div className="mt-4 grid flex-1">
					<div className={`flex flex-col gap-2.5 [grid-area:1/1] ${pending ? "" : "invisible"}`} aria-hidden="true">
						<div className={`h-7 w-12 rounded-md ${pending === "asking" ? "e-shimmer" : "bg-zinc-100"}`} />
						<div className={`h-4 w-24 rounded ${pending === "asking" ? "e-shimmer" : "bg-zinc-100"}`} />
						<div className="mt-auto border-t border-zinc-100 pt-2.5">
							<div className={`h-3.5 w-28 max-w-full rounded ${pending === "asking" ? "e-shimmer" : "bg-zinc-100"}`} />
						</div>
					</div>
					<div
						key={resultKey}
						className={`flex flex-col [grid-area:1/1] ${pending ? "invisible" : "e-result"}`}
						style={{ animationDelay: `${index * 70}ms` }}
					>
						<div className="flex items-end justify-between gap-2">
							<p
								className={`text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums ${answer.mentioned ? "text-zinc-950" : "text-zinc-300"}`}
							>
								{answer.mentioned ? `#${answer.rank}` : "—"}
								<span className="sr-only">{answer.mentioned ? " rank in the answer" : " not ranked"}</span>
							</p>
						</div>
						<p
							className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
								answer.mentioned
									? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15"
									: "bg-zinc-100 text-zinc-600"
							}`}
						>
							{answer.mentioned ? (
								<Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
							) : (
								<Minus className="size-3" strokeWidth={2.5} aria-hidden="true" />
							)}
							{answer.mentioned ? "Mentioned" : "Not mentioned"}
						</p>
						<div className="mt-3.5 border-t border-zinc-100 pt-2.5">
							<p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-zinc-500">Top source</p>
							<p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-700">
								<Favicon domain={answer.source} />
								<span className="truncate font-mono text-[11.5px]">{answer.source}</span>
							</p>
						</div>
					</div>
				</div>
			</div>
		</li>
	);
}

/** Hairlines fanning out of the prompt box into each engine card (desktop only). */
function Wires({ answers, phase }: { answers: Answer[]; phase: Phase }) {
	const n = ENGINES.length;
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 1000 64"
			preserveAspectRatio="none"
			className="pointer-events-none absolute inset-x-0 top-0 hidden h-16 w-full overflow-visible lg:block"
		>
			{ENGINES.map((engine, i) => {
				const sx = 360 + (280 / (n - 1)) * i;
				const ex = ((i + 0.5) / n) * 1000;
				const offset = i - (n - 1) / 2;
				const ey = 64 + offset * offset * 3;
				const d = `M ${sx} -10 C ${sx} 30, ${ex} 26, ${ex} ${ey}`;
				const lit = phase === "shown" && answers[i].mentioned;
				return (
					<g key={engine.name}>
						<path
							d={d}
							fill="none"
							vectorEffect="non-scaling-stroke"
							strokeWidth={1}
							className={`transition-[stroke] duration-500 ${lit ? "stroke-emerald-500/60" : "stroke-zinc-300"}`}
						/>
						{phase === "asking" ? (
							<path
								d={d}
								fill="none"
								vectorEffect="non-scaling-stroke"
								strokeWidth={1.5}
								strokeDasharray="4 6"
								className="e-wire-flow stroke-blue-500"
							/>
						) : null}
					</g>
				);
			})}
		</svg>
	);
}

function Summary({ answers, pending, announce }: { answers: Answer[]; pending: boolean; announce: boolean }) {
	const mentioned = answers.filter((a) => a.mentioned).length;
	const ranks = answers.flatMap((a) => (a.mentioned && a.rank ? [a.rank] : []));
	const avgRank = ranks.length ? (ranks.reduce((sum, r) => sum + r, 0) / ranks.length).toFixed(1) : "—";
	return (
		<div
			aria-live={announce ? "polite" : "off"}
			className="mx-auto mt-8 flex max-w-3xl flex-col gap-3 rounded-2xl bg-white/80 px-4 py-3.5 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_10px_30px_-18px_rgb(24_24_27/0.25)] backdrop-blur sm:flex-row sm:items-center sm:gap-5 sm:rounded-full sm:py-2.5 sm:pl-6 sm:pr-2.5 lg:mt-12"
		>
			<p className="text-[13px] text-zinc-600">
				Your visibility for this prompt<span className="sr-only">: </span>
			</p>
			<div className="flex flex-1 items-center gap-1" aria-hidden="true">
				{answers.map((a, i) => (
					<span
						key={ENGINES[i].name}
						className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
							pending ? "bg-zinc-200" : a.mentioned ? "bg-emerald-500" : "bg-zinc-200"
						}`}
					/>
				))}
			</div>
			<div className="flex items-center gap-2">
				<p className="inline-flex h-8 items-center rounded-full bg-zinc-950 px-3.5 text-[13px] text-white tabular-nums">
					{pending ? (
						<span className="text-zinc-400">Asking {ENGINES.length} engines…</span>
					) : (
						<>
							<span className="font-semibold">
								{mentioned}/{ENGINES.length}
							</span>
							<span className="ml-1 text-zinc-300">engines</span>
						</>
					)}
				</p>
				<p className="inline-flex h-8 items-center rounded-full px-3 text-[13px] text-zinc-600 ring-1 ring-zinc-200 tabular-nums">
					Avg. rank <span className="ml-1 font-semibold text-zinc-950">{pending ? "…" : `#${avgRank}`}</span>
				</p>
			</div>
		</div>
	);
}

type DemoState = { index: number; chars: number; phase: Phase; shown: number; cycles: number };

const INITIAL: DemoState = { index: 0, chars: PROMPTS[0].text.length, phase: "shown", shown: 0, cycles: 0 };

/** The next beat of the typewriter loop, or null when it should sit still. */
function nextBeat(s: DemoState, auto: boolean, reduced: boolean): { delay: number; next: DemoState } | null {
	const length = PROMPTS[s.index].text.length;
	switch (s.phase) {
		case "shown":
			if (!auto || reduced) return null;
			return { delay: s.cycles === 0 ? 6500 : 4800, next: { ...s, phase: "erasing" } };
		case "erasing":
			if (s.chars > 0) return { delay: 16, next: { ...s, chars: Math.max(0, s.chars - 3) } };
			return { delay: 260, next: { ...s, index: (s.index + 1) % PROMPTS.length, phase: "typing" } };
		case "typing":
			if (s.chars < length) {
				// Uneven keystrokes read as a person typing rather than a ticker.
				return { delay: auto ? 28 + ((s.chars * 7) % 5) * 9 : 14, next: { ...s, chars: s.chars + 1 } };
			}
			return { delay: 280, next: { ...s, phase: "asking" } };
		case "asking":
			return { delay: 1100, next: { ...s, phase: "shown", shown: s.index, cycles: s.cycles + 1 } };
	}
}

export function PromptDemo() {
	const reduced = usePrefersReducedMotion();
	const [state, setState] = useState<DemoState>(INITIAL);
	const [auto, setAuto] = useState(true);
	const { index, chars, phase, shown, cycles } = state;

	useEffect(() => {
		const beat = nextBeat(state, auto, reduced);
		if (!beat) return;
		const t = setTimeout(() => setState(beat.next), beat.delay);
		return () => clearTimeout(t);
	}, [state, auto, reduced]);

	function choose(i: number) {
		setAuto(false);
		setState((s) =>
			reduced
				? { ...s, index: i, chars: PROMPTS[i].text.length, shown: i, phase: "shown" }
				: { ...s, index: i, chars: 0, phase: "typing" },
		);
	}

	function toggleAuto() {
		setAuto((a) => !a);
		if (!auto && phase === "shown") setState((s) => ({ ...s, phase: "erasing" }));
	}

	const prompt = PROMPTS[index];
	const answers = PROMPTS[shown].answers;
	const pending: "idle" | "asking" | false =
		phase === "asking" ? "asking" : phase === "typing" || phase === "erasing" ? "idle" : false;
	const busy = phase !== "shown";

	return (
		<figure className="relative">
			<style>{demoCss}</style>
			<figcaption className="sr-only">
				Illustrative example: Elmo asks six AI engines the same buyer question and records whether a fictional invoicing
				app, Tallyfox, is mentioned, where it ranks, and which source each answer leans on.
			</figcaption>

			{/* Example prompts you can pick */}
			<div className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
				<span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-500">Try</span>
				{PROMPTS.map((p, i) => (
					<button
						key={p.chip}
						type="button"
						aria-pressed={i === index}
						onClick={() => choose(i)}
						className={`h-7 rounded-full px-3 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
							i === index
								? "bg-zinc-950 text-white"
								: "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-950 hover:ring-zinc-300"
						}`}
					>
						{p.chip}
					</button>
				))}
			</div>

			{/* The prompt box */}
			<div className="relative z-10 mx-auto max-w-3xl">
				<div
					aria-hidden="true"
					className={`e-ring pointer-events-none absolute -inset-3 rounded-[34px] opacity-25 blur-2xl transition-opacity duration-500 ${busy ? "opacity-40" : ""}`}
				/>
				<div className={`e-ring relative rounded-[26px] p-[1.5px] ${busy && !reduced ? "e-ring-fast" : ""}`}>
					<div className="rounded-[24.5px] bg-white/85 shadow-[0_1px_2px_rgb(24_24_27/0.05),0_24px_60px_-24px_rgb(37_99_235/0.35)] backdrop-blur-xl">
						<div className="px-5 pb-3 pt-5 sm:px-7 sm:pb-4 sm:pt-6">
							<p className="sr-only">Example prompt: {prompt.text}</p>
							<p
								aria-hidden="true"
								className="min-h-[3.5rem] text-[1.2rem] leading-7 tracking-[-0.01em] text-zinc-900 sm:min-h-[4.5rem] sm:text-[1.65rem] sm:leading-9"
							>
								{prompt.text.slice(0, chars)}
								<span className="e-caret ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.18em] rounded-full bg-blue-600" />
							</p>
						</div>
						<div className="flex items-center gap-2 px-3.5 pb-3.5 sm:px-5 sm:pb-4">
							<span
								aria-hidden="true"
								className="inline-flex size-8 items-center justify-center rounded-full text-zinc-500 ring-1 ring-zinc-200"
							>
								<Plus className="size-4" />
							</span>
							<span
								aria-hidden="true"
								className="hidden h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-zinc-600 ring-1 ring-zinc-200 sm:inline-flex"
							>
								<Globe className="size-3.5" />
								Search
							</span>
							<span className="ml-1 inline-flex h-6 items-center rounded-full bg-amber-50 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-600/20">
								Example
							</span>
							<span className="truncate text-[12px] text-zinc-500">
								<span className="sm:hidden">Fictional brand</span>
								<span className="max-sm:hidden">Tallyfox is a fictional invoicing app</span>
							</span>
							<div className="ml-auto flex items-center gap-2">
								<button
									type="button"
									onClick={toggleAuto}
									className="inline-flex size-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
								>
									{auto && !reduced ? (
										<Pause className="size-3.5 fill-current" aria-hidden="true" />
									) : (
										<Play className="ml-px size-3.5 fill-current" aria-hidden="true" />
									)}
									<span className="sr-only">
										{auto && !reduced ? "Pause example prompts" : "Cycle example prompts"}
									</span>
								</button>
								<span
									aria-hidden="true"
									className={`inline-flex size-9 items-center justify-center rounded-full text-white transition-colors duration-300 ${busy ? "bg-blue-600" : "bg-zinc-950"}`}
								>
									<ArrowUp className="size-4" strokeWidth={2.25} />
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Engine results */}
			<div className="relative mt-6 lg:mt-0 lg:pt-16">
				<Wires answers={answers} phase={phase} />
				<ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
					{ENGINES.map((engine, i) => (
						<EngineCard
							key={engine.name}
							engine={engine}
							answer={answers[i]}
							pending={pending}
							resultKey={cycles}
							index={i}
						/>
					))}
				</ul>
			</div>

			<Summary answers={answers} pending={pending !== false} announce={!auto} />
		</figure>
	);
}
