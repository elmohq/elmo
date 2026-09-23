import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { ArrowRight, Check, Lightbulb, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";

/*
 * Every name, number, and answer in this file is illustrative. "Northwind" and
 * its competitors are stock sample-company names so nobody mistakes the
 * composition for a real customer's results.
 */

const BRAND = "Northwind";
const PROMPT = "What's the best project management tool for a small creative agency?";
const CYCLE_MS = 5000;

type Brand = "Northwind" | "Globex" | "Initech" | "Hooli";

type Answer = {
	intro: string;
	items: { brand: Brand; text: string; cite: number }[];
	outro: { before: string; brand?: Brand; after: string; cite: number };
	sources: string[];
};

type Engine = { id: string; label: string; iconId: string; visibility: number; answer: Answer };

const ENGINES: Engine[] = [
	{
		id: "chatgpt",
		label: "ChatGPT",
		iconId: "openai",
		visibility: 71,
		answer: {
			intro: "For a small creative agency, these come up most often:",
			items: [
				{ brand: "Globex", text: "flexible boards and polished client portals.", cite: 1 },
				{ brand: "Northwind", text: "built for agencies, with proofing and time tracking together.", cite: 2 },
				{ brand: "Initech", text: "simple and affordable for teams under ten.", cite: 3 },
			],
			outro: {
				before: "If client approvals slow you down, ",
				brand: "Northwind",
				after: " is the strongest fit.",
				cite: 2,
			},
			sources: ["g2.com", "reddit.com", "capterra.com"],
		},
	},
	{
		id: "perplexity",
		label: "Perplexity",
		iconId: "perplexity",
		visibility: 84,
		answer: {
			intro: "Agency owners most often recommend:",
			items: [
				{ brand: "Northwind", text: "briefs, proofing, and billable hours in one place.", cite: 1 },
				{ brand: "Globex", text: "the most customizable, but it takes setup.", cite: 2 },
				{ brand: "Hooli", text: "a good fit if your team already lives in Hooli Docs.", cite: 3 },
			],
			outro: { before: "Reviewers who run agencies tend to favor ", brand: "Northwind", after: ".", cite: 1 },
			sources: ["reddit.com", "capterra.com", "g2.com"],
		},
	},
	{
		id: "gemini",
		label: "Gemini",
		iconId: "google",
		visibility: 38,
		answer: {
			intro: "Popular choices for small agencies include:",
			items: [
				{ brand: "Globex", text: "strong templates for client work.", cite: 1 },
				{ brand: "Initech", text: "easy to learn, with a generous free tier.", cite: 2 },
				{ brand: "Hooli", text: "tight integration with docs and chat.", cite: 3 },
			],
			outro: { before: "", brand: "Globex", after: " is the safest default for most small teams.", cite: 1 },
			sources: ["capterra.com", "g2.com", "youtube.com"],
		},
	},
	{
		id: "ai-overview",
		label: "AI Overview",
		iconId: "google",
		visibility: 55,
		answer: {
			intro: "Top project management tools for creative agencies:",
			items: [
				{ brand: "Globex", text: "client portals and custom workflows.", cite: 1 },
				{ brand: "Initech", text: "lightweight Kanban at a low price.", cite: 2 },
				{ brand: "Northwind", text: "agency-specific proofing and time tracking.", cite: 3 },
			],
			outro: { before: "", after: "Most offer a free trial, so compare two or three before committing.", cite: 1 },
			sources: ["capterra.com", "g2.com", "reddit.com"],
		},
	},
];

const SHARE_OF_VOICE: { brand: Brand; value: number }[] = [
	{ brand: "Globex", value: 31 },
	{ brand: "Northwind", value: 24 },
	{ brand: "Initech", value: 19 },
	{ brand: "Hooli", value: 14 },
];

const TOP_SOURCES = [
	{ domain: "capterra.com", value: 38, citesYou: false },
	{ domain: "g2.com", value: 34, citesYou: true },
	{ domain: "reddit.com", value: 27, citesYou: true },
];

const TREND = [48, 50, 49, 52, 51, 53, 52, 55, 54, 56, 55, 58, 57, 56, 59, 60, 58, 61, 60, 62];

function BrandMark({ brand }: { brand: Brand }) {
	const you = brand === BRAND;
	return (
		<span
			className={
				you
					? "rounded-[5px] bg-blue-600/10 px-1 py-px font-medium text-blue-700 ring-1 ring-blue-600/25 ring-inset"
					: "rounded-[5px] bg-zinc-100 px-1 py-px font-medium text-zinc-900 ring-1 ring-zinc-200 ring-inset"
			}
		>
			{brand}
		</span>
	);
}

function Cite({ n }: { n: number }) {
	return (
		<sup className="ml-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded-full bg-amber-100 px-1 align-middle font-mono text-[10px] font-medium text-amber-800 ring-1 ring-amber-300/70 ring-inset">
			{n}
		</sup>
	);
}

/** Keeps a citation marker on the same line as the word it follows. */
function WithCite({ text, n }: { text: string; n: number }) {
	const cut = text.lastIndexOf(" ") + 1;
	return (
		<>
			{text.slice(0, cut)}
			<span className="whitespace-nowrap">
				{text.slice(cut)}
				<Cite n={n} />
			</span>
		</>
	);
}

function Favicon({ domain }: { domain: string }) {
	return (
		<span
			aria-hidden="true"
			className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-zinc-900 font-mono text-[9px] font-semibold uppercase text-white"
		>
			{domain[0]}
		</span>
	);
}

/** Small numbered tag tying each card back to the three-step story. */
function Step({ n, active = false }: { n: string; active?: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={`font-mono text-[10px] tracking-wider ${active ? "text-blue-600" : "text-zinc-400"}`}
		>
			{n}
		</span>
	);
}

/**
 * A dashed leader line from the answer card's edge out across the gutter to
 * the insight card that measures that part of the answer. Desktop only; `top`
 * is tuned to the answer's layout, which is fixed-width at that breakpoint.
 */
function Leader({ side, top }: { side: "left" | "right"; top: number }) {
	return (
		<span
			aria-hidden="true"
			style={{ top }}
			className={`pointer-events-none absolute z-10 hidden w-12 -translate-y-1/2 items-center lg:flex ${side === "left" ? "right-full -mr-1" : "left-full -ml-1 flex-row-reverse"}`}
		>
			<span className="h-px flex-1 [background-image:linear-gradient(to_right,rgb(37_99_235/0.6)_50%,transparent_50%)] [background-size:6px_1px]" />
			<span className="size-2 shrink-0 rounded-full bg-white ring-2 ring-blue-600" />
		</span>
	);
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={`relative rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04),0_12px_32px_-12px_rgb(24_24_27/0.18)] ${className}`}
		>
			{children}
		</div>
	);
}

function CardTitle({ step, children, accent = false }: { step: string; children: React.ReactNode; accent?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-2">
			<p className={`text-[13px] font-medium ${accent ? "text-blue-700" : "text-zinc-950"}`}>{children}</p>
			<Step n={step} active={accent} />
		</div>
	);
}

function Sparkline({ values }: { values: number[] }) {
	const w = 120;
	const h = 36;
	const min = Math.min(...values) - 2;
	const max = Math.max(...values) + 2;
	const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - ((v - min) / (max - min)) * h] as const);
	const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
	const [lx, ly] = pts[pts.length - 1];
	return (
		<svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`} className="h-9 w-[120px] overflow-visible">
			<defs>
				<linearGradient id="a1-spark" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0" stopColor="#2563eb" stopOpacity="0.18" />
					<stop offset="1" stopColor="#2563eb" stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#a1-spark)" />
			<path d={line} fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
			<circle cx={lx} cy={ly} r="3" fill="#fff" stroke="#2563eb" strokeWidth="1.75" />
		</svg>
	);
}

function VisibilityCard({ active }: { active: number }) {
	return (
		<Card>
			<CardTitle step="02">AI visibility</CardTitle>
			<p className="mt-0.5 text-xs text-zinc-500">Answers that mention {BRAND}</p>
			<div className="mt-3 flex items-end justify-between gap-3">
				<div>
					<p className="text-[2rem] font-semibold leading-none tracking-[-0.03em] text-zinc-950 tabular-nums">62%</p>
					<p className="mt-1.5 text-xs font-medium text-emerald-600 tabular-nums">+14 pts · 30d</p>
				</div>
				<Sparkline values={TREND} />
			</div>
			<ul className="mt-4 grid grid-cols-4 gap-1.5 border-t border-zinc-100 pt-3">
				{ENGINES.map((e, i) => (
					<li
						key={e.id}
						className={`flex flex-col items-center gap-1 rounded-md py-1.5 transition-colors ${i === active ? "bg-blue-50 text-blue-700" : "text-zinc-500"}`}
					>
						<ModelIcon iconId={e.iconId} className="size-3" />
						<span className="font-mono text-[11px] tabular-nums">{e.visibility}%</span>
						<span className="sr-only">{e.label}</span>
					</li>
				))}
			</ul>
		</Card>
	);
}

function ShareOfVoiceCard() {
	return (
		<Card>
			<CardTitle step="02">Share of voice</CardTitle>
			<p className="mt-0.5 text-xs text-zinc-500">
				{BRAND} ranks <span className="font-medium text-zinc-900">#2</span> of 4 brands
			</p>
			<ul className="mt-3.5 space-y-2.5">
				{SHARE_OF_VOICE.map((row) => {
					const you = row.brand === BRAND;
					return (
						<li key={row.brand} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-xs">
							<span className={you ? "font-medium text-blue-700" : "text-zinc-600"}>{row.brand}</span>
							<span className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
								<span
									className={`block h-full rounded-full ${you ? "bg-blue-600" : "bg-zinc-300"}`}
									style={{ width: `${(row.value / 31) * 100}%` }}
								/>
							</span>
							<span className={`text-right font-mono tabular-nums ${you ? "text-blue-700" : "text-zinc-500"}`}>
								{row.value}%
							</span>
						</li>
					);
				})}
			</ul>
		</Card>
	);
}

function SourcesCard() {
	return (
		<Card>
			<CardTitle step="02">Top cited sources</CardTitle>
			<p className="mt-0.5 text-xs text-zinc-500">Share of answers citing each site</p>
			<ul className="mt-3.5 space-y-2.5">
				{TOP_SOURCES.map((s) => (
					<li key={s.domain} className="flex items-center gap-2 text-xs">
						<Favicon domain={s.domain} />
						<span className="flex-1 truncate text-zinc-700">{s.domain}</span>
						{s.citesYou ? (
							<span className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500">
								<Check className="size-3 text-emerald-600" aria-hidden="true" />
								lists you
							</span>
						) : (
							<span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 ring-inset">
								<X className="size-3" aria-hidden="true" />
								missing
							</span>
						)}
						<span className="w-8 text-right font-mono tabular-nums text-zinc-500">{s.value}%</span>
					</li>
				))}
			</ul>
		</Card>
	);
}

function OpportunityCard() {
	return (
		<div className="relative rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 p-4 text-white shadow-[0_0_0_1px_rgb(29_78_216/0.9),0_16px_36px_-12px_rgb(37_99_235/0.6)]">
			<div className="flex items-center justify-between gap-2">
				<p className="inline-flex items-center gap-1.5 text-[13px] font-medium">
					<Lightbulb className="size-3.5" aria-hidden="true" />
					Opportunity
				</p>
				<span className="rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-blue-50">
					High impact
				</span>
			</div>
			<p className="mt-3 text-[15px] font-semibold leading-snug tracking-[-0.01em]">Get listed on capterra.com</p>
			<p className="mt-1.5 text-xs/5 text-blue-100">
				Cited in 38% of answers in your category. Globex and Initech are listed there. {BRAND} isn't.
			</p>
			<p className="mt-3 inline-flex items-center gap-1 border-t border-white/15 pt-3 text-xs font-medium text-white">
				Pitch a listing and review profile
				<ArrowRight className="size-3" aria-hidden="true" />
			</p>
		</div>
	);
}

function AnswerCard({
	active,
	onSelect,
	cycling,
}: {
	active: number;
	onSelect: (i: number) => void;
	cycling: boolean;
}) {
	const engine = ENGINES[active];
	const { answer } = engine;
	const rank = answer.items.findIndex((it) => it.brand === BRAND);
	const mentioned = rank !== -1;
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		e.preventDefault();
		const next = (active + (e.key === "ArrowRight" ? 1 : ENGINES.length - 1)) % ENGINES.length;
		onSelect(next);
		tabRefs.current[next]?.focus();
	};

	return (
		<div className="relative overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_32px_64px_-20px_rgb(37_99_235/0.35)]">
			<div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/80 px-2 sm:px-3">
				<div role="tablist" aria-label="AI engine" className="flex min-w-0 overflow-x-auto" onKeyDown={onKeyDown}>
					{ENGINES.map((e, i) => {
						const selected = i === active;
						return (
							<button
								key={e.id}
								ref={(el) => {
									tabRefs.current[i] = el;
								}}
								type="button"
								role="tab"
								id={`a1-tab-${e.id}`}
								aria-selected={selected}
								aria-controls="a1-answer"
								tabIndex={selected ? 0 : -1}
								onClick={() => onSelect(i)}
								className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-3 ${selected ? "text-zinc-950" : "text-zinc-500 hover:text-zinc-800"}`}
							>
								<ModelIcon iconId={e.iconId} className="size-3.5" />
								<span className={selected ? "" : "max-sm:sr-only"}>{e.label}</span>
								{selected ? (
									<span
										aria-hidden="true"
										className="absolute inset-x-2 -bottom-px h-0.5 overflow-hidden rounded-full bg-zinc-200"
									>
										<span
											key={`${active}-${cycling}`}
											className={`block h-full origin-left rounded-full bg-zinc-950 ${cycling ? "a1-progress" : ""}`}
										/>
									</span>
								) : null}
							</button>
						);
					})}
				</div>
				<span className="hidden shrink-0 rounded-full bg-white px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 ring-1 ring-zinc-200 sm:inline">
					Example
				</span>
			</div>

			<div className="px-4 pt-4 sm:px-6 sm:pt-5">
				<div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2 text-[13px]/5 text-zinc-800 sm:text-sm/6">
					{PROMPT}
				</div>
			</div>

			<div
				id="a1-answer"
				role="tabpanel"
				aria-labelledby={`a1-tab-${engine.id}`}
				key={engine.id}
				className="animate-in fade-in px-4 pb-4 pt-4 text-[13px]/6 text-zinc-700 duration-500 motion-reduce:animate-none sm:min-h-[292px] sm:px-6 sm:text-sm/6"
			>
				<p>{answer.intro}</p>
				<ol className="mt-2.5 space-y-2">
					{answer.items.map((it, i) => (
						<li key={it.brand} className="flex gap-2.5">
							<span className="w-3 shrink-0 font-mono text-xs/6 text-zinc-400">{i + 1}.</span>
							<span>
								<BrandMark brand={it.brand} /> — <WithCite text={it.text} n={it.cite} />
							</span>
						</li>
					))}
				</ol>
				<p className="mt-3">
					{answer.outro.before}
					{answer.outro.brand ? <BrandMark brand={answer.outro.brand} /> : null}
					<WithCite text={answer.outro.after} n={answer.outro.cite} />
				</p>
				<ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Cited sources">
					{answer.sources.map((d, i) => (
						<li
							key={d}
							className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white pl-1.5 pr-2.5 text-xs text-zinc-600 ring-1 ring-zinc-200"
						>
							<span className="font-mono text-[10px] text-amber-700">{i + 1}</span>
							<Favicon domain={d} />
							{d}
						</li>
					))}
				</ul>
			</div>

			<div
				className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-4 py-3 text-xs sm:px-6 ${mentioned ? "border-zinc-100 bg-zinc-50/70" : "border-amber-200/70 bg-amber-50/80"}`}
			>
				<span className="inline-flex items-center gap-1.5 font-medium text-zinc-900">
					<Logo className="text-sm leading-none" />
					<span className="text-zinc-500">read this answer</span>
				</span>
				{mentioned ? (
					<>
						<span className="text-zinc-600">
							{BRAND} <span className="font-medium text-zinc-900">#{rank + 1}</span> of {answer.items.length}
						</span>
						<span className="text-zinc-600">
							{answer.items.length - 1} competitors · {answer.sources.length} sources
						</span>
					</>
				) : (
					<span className="font-medium text-amber-800">{BRAND} not mentioned · 3 competitors are</span>
				)}
			</div>
		</div>
	);
}

const STEPS = [
	{ n: "01", label: "AI answers your buyer" },
	{ n: "02", label: "Elmo measures who wins" },
	{ n: "03", label: "You get the next move" },
];

const motionCss = `
@keyframes a1-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.a1-progress { animation: a1-progress ${CYCLE_MS}ms linear forwards; }
@media (prefers-reduced-motion: reduce) { .a1-progress { animation: none; transform: scaleX(1); } }
`;

/**
 * The hero's explainer: one AI answer with the brand, competitors, and sources
 * marked up, surrounded by the Elmo measurements taken from answers like it.
 */
export function HeroVisual({ footer }: { footer?: React.ReactNode }) {
	const [active, setActive] = useState(0);
	// Picking a tab hands control to the visitor; the auto-tour stops for good.
	const [paused, setPaused] = useState(false);
	const [reducedMotion, setReducedMotion] = useState(true);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReducedMotion(mq.matches);
		const onChange = () => setReducedMotion(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const cycling = !reducedMotion && !paused;

	useEffect(() => {
		if (!cycling) return;
		const t = window.setInterval(() => setActive((i) => (i + 1) % ENGINES.length), CYCLE_MS);
		return () => window.clearInterval(t);
	}, [cycling]);

	const select = (i: number) => {
		setActive(i);
		setPaused(true);
	};

	return (
		<figure className="relative">
			<style>{motionCss}</style>
			<ol className="mx-auto mb-8 flex max-w-3xl flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-center sm:gap-3 md:mb-10">
				{STEPS.map((s, i) => (
					<li key={s.n} className="flex items-center gap-3 text-[13px] text-zinc-600">
						<span className="inline-flex items-center gap-2">
							<span
								className={`inline-flex h-5 items-center rounded-full px-1.5 font-mono text-[10px] tracking-wider ring-1 ring-inset ${i === 2 ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-zinc-500 ring-zinc-200"}`}
							>
								{s.n}
							</span>
							{s.label}
						</span>
						{i < STEPS.length - 1 ? (
							<ArrowRight aria-hidden="true" className="hidden size-3.5 text-zinc-300 sm:block" />
						) : null}
					</li>
				))}
			</ol>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)_minmax(0,1fr)] lg:gap-x-12 lg:gap-y-0">
				<div className="relative lg:col-start-2 lg:row-start-1">
					<Leader side="left" top={223} />
					<Leader side="left" top={442} />
					<Leader side="right" top={190} />
					<Leader side="right" top={357} />
					<AnswerCard active={active} onSelect={select} cycling={cycling} />
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:col-start-1 lg:row-start-1 lg:grid-cols-1 lg:content-start lg:gap-6 lg:pt-16">
					<VisibilityCard active={active} />
					<ShareOfVoiceCard />
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:col-start-3 lg:row-start-1 lg:grid-cols-1 lg:content-start lg:gap-6 lg:pt-28">
					<SourcesCard />
					<OpportunityCard />
				</div>
			</div>

			<figcaption className="mt-8 flex flex-col items-center gap-2 text-center text-[13px] text-zinc-500 sm:flex-row sm:justify-center sm:gap-3">
				<span>
					<span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">Example</span>
					<span aria-hidden="true" className="mx-2 text-zinc-300">
						·
					</span>
					Northwind, Globex, Initech, and Hooli are fictional; the data is illustrative.
				</span>
				{footer}
			</figcaption>
		</figure>
	);
}
