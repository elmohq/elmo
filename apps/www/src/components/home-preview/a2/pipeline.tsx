import { ArrowRight, Check, Clock, Minus, Sparkles } from "lucide-react";
import { MODELS } from "./models";

// Every value in this diagram is illustrative. "Acme Outdoor" and "Summit Gear"
// are made-up brands so nobody reads it as a real customer's results.

const PROMPTS = [
	"best trail running shoes for beginners",
	"waterproof hiking boots under $200",
	"Acme vs. Summit Gear: which lasts longer?",
	"most comfortable daypack for travel",
];
const ACTIVE_PROMPT = 1;

type Result = {
	engine: string;
	short?: string;
	mentioned: boolean;
	rank?: number;
	source: string;
	more: number;
};

const RESULTS: Result[] = [
	{ engine: "ChatGPT", mentioned: true, rank: 2, source: "reddit.com", more: 2 },
	{ engine: "Claude", mentioned: true, rank: 1, source: "acme.com", more: 1 },
	{ engine: "Gemini", mentioned: false, source: "outdoorgearlab.com", more: 2 },
	{ engine: "Perplexity", mentioned: true, rank: 3, source: "reddit.com", more: 4 },
	{ engine: "Google AI Overviews", short: "AI Overviews", mentioned: false, source: "summitgear.com", more: 3 },
];
const ACTIVE_ROW = 2;
const MENTIONED = RESULTS.filter((r) => r.mentioned).length;

const ACTIONS = [
	{
		kind: "Pitch",
		impact: "High",
		title: "Pitch outdoorgearlab.com",
		why: "Gemini cites its boot roundup, and Acme isn't in it.",
	},
	{
		kind: "Seed",
		impact: "Med",
		title: "Join the Reddit hiking threads",
		why: "A top source for ChatGPT and Perplexity.",
	},
	{
		kind: "Create",
		impact: "Low",
		title: "Publish Acme vs. Summit Gear",
		why: "AI Overviews cites summitgear.com instead.",
	},
];

function iconFor(name: string) {
	return MODELS.find((m) => m.name === name)?.icon ?? MODELS[0].icon;
}

// Desktop geometry: every card is CARD_H tall with a HEADER_H header and
// ROW_H rows, so the connector SVGs can land exactly on row centres.
const CARD_H = 350;
const HEADER_H = 40;
const ROW_H = 54;
const MID = CARD_H / 2;
const rowY = (i: number) => HEADER_H + ROW_H * i + ROW_H / 2;

const flowCss = `
@media (prefers-reduced-motion: no-preference) {
	.a2-flow { animation: a2-flow 1.1s linear infinite; }
	.a2-pulse { animation: a2-pulse 2.4s cubic-bezier(.45,0,.25,1) infinite; }
	.a2-pulse-2 { animation-delay: .8s; }
	.a2-pulse-3 { animation-delay: 1.6s; }
	.a2-ping { animation: a2-ping 2.4s ease-out infinite; }
}
@media (prefers-reduced-motion: reduce) { .a2-pulse { display: none; } }
@keyframes a2-flow { to { stroke-dashoffset: -16; } }
@keyframes a2-pulse { 0% { stroke-dashoffset: 18; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { stroke-dashoffset: -100; opacity: 0; } }
@keyframes a2-ping { 0% { transform: scale(1); opacity: .5; } 70%, 100% { transform: scale(2.6); opacity: 0; } }
`;

function StepLabel({ n, children }: { n: string; children: React.ReactNode }) {
	return (
		<p className="flex h-6 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
			<span className="inline-flex h-[18px] items-center rounded bg-blue-600/10 px-1.5 text-[10px] tracking-[0.08em] text-blue-700">
				{n}
			</span>
			{children}
		</p>
	);
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={`relative flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04),0_12px_24px_-12px_rgb(24_24_27/0.12)] xl:h-[350px] ${className}`}
		>
			{children}
		</div>
	);
}

function CardHeader({ title, meta }: { title: string; meta?: React.ReactNode }) {
	return (
		<div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-3.5">
			<span className="shrink-0 text-[13px] font-semibold text-zinc-950">{title}</span>
			{meta ? <span className="truncate font-mono text-[10px] text-zinc-500">{meta}</span> : null}
		</div>
	);
}

function CardFooter({ children }: { children: React.ReactNode }) {
	return (
		<div className="mt-auto flex h-10 shrink-0 items-center gap-1.5 border-t border-zinc-100 bg-zinc-50/70 px-3.5 text-[11px] text-zinc-500">
			{children}
		</div>
	);
}

/** Hairline path + flowing dashes; the active one also glows and carries a travelling pulse. */
function Wire({ d, active, gradId, delay = 1 }: { d: string; active?: boolean; gradId: string; delay?: 1 | 2 | 3 }) {
	return (
		<g>
			{active ? (
				<path d={d} fill="none" stroke="rgb(59 130 246 / 0.45)" strokeWidth={6} filter={`url(#${gradId}-glow)`} />
			) : null}
			<path d={d} fill="none" stroke={active ? "rgb(37 99 235)" : "rgb(212 212 216)"} strokeWidth={active ? 1.5 : 1} />
			<path
				d={d}
				fill="none"
				stroke={`url(#${gradId})`}
				strokeWidth={active ? 1.5 : 1}
				strokeDasharray="2 6"
				strokeLinecap="round"
				className="a2-flow"
				opacity={active ? 1 : 0.55}
			/>
			{active ? (
				<path
					d={d}
					fill="none"
					pathLength={100}
					stroke="white"
					strokeWidth={2.5}
					strokeLinecap="round"
					strokeDasharray="10 200"
					strokeDashoffset={18}
					className={`a2-pulse a2-pulse-${delay}`}
					style={{ mixBlendMode: "screen" }}
				/>
			) : null}
		</g>
	);
}

function Port({ x, y, active }: { x: number; y: number; active?: boolean }) {
	return (
		<circle
			cx={x}
			cy={y}
			r={3}
			fill="white"
			stroke={active ? "rgb(37 99 235)" : "rgb(212 212 216)"}
			strokeWidth={active ? 1.5 : 1}
		/>
	);
}

function Defs({ id, width }: { id: string; width: number }) {
	return (
		<defs>
			<linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={width} y2={0}>
				<stop offset="0" stopColor="rgb(147 197 253)" />
				<stop offset="1" stopColor="rgb(37 99 235)" />
			</linearGradient>
			<filter id={`${id}-glow`} filterUnits="userSpaceOnUse" x={-12} y={-12} width={width + 24} height={CARD_H + 24}>
				<feGaussianBlur stdDeviation="3" />
			</filter>
		</defs>
	);
}

/** Desktop connector column between two stages. */
function Connector({
	width,
	from,
	to,
	active,
	gradId,
	delay,
}: {
	width: number;
	from: number[];
	to: number[];
	active: number;
	gradId: string;
	delay?: 1 | 2 | 3;
}) {
	const n = Math.max(from.length, to.length);
	const pairs = Array.from({ length: n }, (_, i) => ({
		y1: from[Math.min(i, from.length - 1)],
		y2: to[Math.min(i, to.length - 1)],
		i,
	}));
	const c = width / 2;
	// Draw the active wire last so it sits above the others.
	const ordered = [...pairs.filter((p) => p.i !== active), pairs[active]];
	return (
		<svg
			aria-hidden="true"
			width={width}
			height={CARD_H}
			viewBox={`0 0 ${width} ${CARD_H}`}
			className="hidden overflow-visible xl:block"
		>
			<Defs id={gradId} width={width} />
			{ordered.map((p) => (
				<Wire
					key={p.i}
					d={`M0 ${p.y1} C${c} ${p.y1} ${c} ${p.y2} ${width} ${p.y2}`}
					active={p.i === active}
					gradId={gradId}
					delay={delay}
				/>
			))}
			{ordered.map((p) => (
				<g key={`p${p.i}`}>
					<Port x={0} y={p.y1} active={p.i === active} />
					<Port x={width} y={p.y2} active={p.i === active} />
				</g>
			))}
		</svg>
	);
}

/** Mobile connector: a short downward wire between stacked stages. */
function DownConnector({ gradId, delay }: { gradId: string; delay?: 1 | 2 | 3 }) {
	return (
		<div aria-hidden="true" className="flex justify-center xl:hidden">
			<svg aria-hidden="true" width={24} height={32} viewBox="0 0 24 32" className="overflow-visible">
				<defs>
					<linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={32}>
						<stop offset="0" stopColor="rgb(147 197 253)" />
						<stop offset="1" stopColor="rgb(37 99 235)" />
					</linearGradient>
					<filter id={`${gradId}-glow`} filterUnits="userSpaceOnUse" x={-12} y={-12} width={48} height={56}>
						<feGaussianBlur stdDeviation="3" />
					</filter>
				</defs>
				<Wire d="M12 0 L12 32" active gradId={gradId} delay={delay} />
				<Port x={12} y={0} active />
				<Port x={12} y={32} active />
			</svg>
		</div>
	);
}

function PromptsCard() {
	return (
		<Card>
			<CardHeader title="Your prompts" meta={`${PROMPTS.length} tracked`} />
			<ul className="flex flex-1 flex-col p-1.5">
				{PROMPTS.map((p, i) => {
					const active = i === ACTIVE_PROMPT;
					return (
						<li
							key={p}
							className={`relative flex flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-[12.5px] leading-snug ${
								active ? "bg-blue-50 text-zinc-950 ring-1 ring-blue-600/20" : "text-zinc-600"
							}`}
						>
							<span
								aria-hidden="true"
								className={`inline-flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] ${
									active ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-500"
								}`}
							>
								{i + 1}
							</span>
							<span className="text-pretty">{p}</span>
						</li>
					);
				})}
			</ul>
			<CardFooter>
				<Clock className="size-3" aria-hidden="true" />
				Re-asked on a schedule
			</CardFooter>
		</Card>
	);
}

function EnginesCard() {
	const more = MODELS.length - RESULTS.length;
	return (
		<Card>
			<CardHeader title="AI engines" />
			{/* Desktop: one row per engine, aligned with the results rows. */}
			<ul className="hidden xl:block">
				{RESULTS.map((r, i) => {
					const Icon = iconFor(r.engine);
					const active = i === ACTIVE_ROW;
					return (
						<li key={r.engine} className="flex h-12 items-center gap-2.5 px-3.5 xl:h-[54px]">
							<span
								className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md p-1.5 ring-1 ${
									active ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-zinc-800 ring-zinc-200"
								}`}
							>
								<Icon />
							</span>
							<span className="truncate text-[13px] font-medium text-zinc-800">{r.short ?? r.engine}</span>
							<span className="relative ml-auto flex size-1.5 shrink-0">
								{active ? <span className="a2-ping absolute inset-0 rounded-full bg-blue-500" /> : null}
								<span className={`relative size-1.5 rounded-full ${active ? "bg-blue-500" : "bg-emerald-500"}`} />
							</span>
						</li>
					);
				})}
			</ul>
			{/* Mobile: a compact wrap of engine chips. */}
			<ul className="flex flex-wrap gap-1.5 p-3 xl:hidden">
				{RESULTS.map((r) => {
					const Icon = iconFor(r.engine);
					return (
						<li
							key={r.engine}
							className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-2.5 text-[12.5px] font-medium text-zinc-800 ring-1 ring-zinc-200"
						>
							<span className="size-3.5">
								<Icon />
							</span>
							{r.short ?? r.engine}
						</li>
					);
				})}
			</ul>
			<CardFooter>+{more} more engines</CardFooter>
		</Card>
	);
}

function ResultsCard() {
	return (
		<Card>
			<CardHeader title="What they said" meta={`“${PROMPTS[ACTIVE_PROMPT]}”`} />
			<ul>
				{RESULTS.map((r, i) => {
					const Icon = iconFor(r.engine);
					const active = i === ACTIVE_ROW;
					return (
						<li
							key={r.engine}
							className={`relative flex h-12 items-center gap-2.5 px-3.5 xl:h-[54px] ${active ? "bg-blue-50/70" : ""} ${
								i > 0 ? "border-t border-zinc-100" : ""
							}`}
						>
							{active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-blue-600" /> : null}
							<span className="flex w-24 shrink-0 items-center gap-2 sm:w-36 xl:hidden">
								<span className="size-3.5 shrink-0 text-zinc-700">
									<Icon />
								</span>
								<span className="truncate text-[12px] font-medium text-zinc-800">{r.short ?? r.engine}</span>
							</span>
							{r.mentioned ? (
								<span className="inline-flex h-[22px] w-[5.75rem] shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/15">
									<Check className="size-3" aria-hidden="true" />
									Mentioned
								</span>
							) : (
								<span className="inline-flex h-[22px] w-[5.75rem] shrink-0 items-center gap-1 rounded-full bg-white px-2 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-200">
									<Minus className="size-3" aria-hidden="true" />
									Not named
								</span>
							)}
							<span
								className={`w-6 shrink-0 text-center font-mono text-[12px] tabular-nums ${r.rank ? "text-zinc-900" : "text-zinc-300"}`}
							>
								{r.rank ? `#${r.rank}` : "—"}
							</span>
							<span className="ml-auto flex min-w-0 items-center gap-1.5 max-sm:hidden">
								<span
									aria-hidden="true"
									className="inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-zinc-100 font-mono text-[9px] uppercase text-zinc-600"
								>
									{r.source[0]}
								</span>
								<span className="truncate font-mono text-[11px] text-zinc-600">{r.source}</span>
								<span className="shrink-0 font-mono text-[10px] text-zinc-400">+{r.more}</span>
							</span>
						</li>
					);
				})}
			</ul>
			<CardFooter>
				<span className="font-medium text-zinc-900">Visibility {Math.round((MENTIONED / RESULTS.length) * 100)}%</span>
				<span className="text-zinc-300">·</span>
				named in {MENTIONED} of {RESULTS.length} answers
			</CardFooter>
		</Card>
	);
}

const IMPACT_CLS: Record<string, string> = {
	High: "bg-blue-600 text-white",
	Med: "bg-blue-100 text-blue-800",
	Low: "bg-zinc-100 text-zinc-600",
};

function ActionsCard() {
	return (
		<Card className="shadow-[0_0_0_1px_rgb(37_99_235/0.35),0_1px_2px_rgb(24_24_27/0.04),0_16px_40px_-12px_rgb(37_99_235/0.35)]">
			<CardHeader
				title="Opportunities"
				meta={
					<span className="inline-flex items-center gap-1 text-blue-700">
						<Sparkles className="size-3" aria-hidden="true" />
						Ranked by impact
					</span>
				}
			/>
			<ol className="flex flex-1 flex-col gap-1 p-1.5">
				{ACTIONS.map((a, i) => (
					<li
						key={a.title}
						className={`flex flex-1 flex-col justify-center rounded-lg px-2.5 py-2 ${i === 0 ? "bg-blue-50/70 ring-1 ring-blue-600/20" : ""}`}
					>
						<div className="flex items-center gap-1.5">
							<span
								className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] uppercase leading-none tracking-[0.08em] ${IMPACT_CLS[a.impact]}`}
							>
								{a.impact}
							</span>
							<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500">{a.kind}</span>
						</div>
						<p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-zinc-950">{a.title}</p>
						<p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500">{a.why}</p>
					</li>
				))}
			</ol>
			<CardFooter>
				<span className="inline-flex items-center gap-1 font-medium text-blue-700">
					Generated from your answer data
					<ArrowRight className="size-3" aria-hidden="true" />
				</span>
			</CardFooter>
		</Card>
	);
}

export function PipelineDiagram() {
	const engineRows = RESULTS.map((_, i) => rowY(i));
	return (
		<figure className="relative">
			<style>{flowCss}</style>
			<figcaption className="sr-only">
				Example of how Elmo works, using a fictional brand, Acme Outdoor: your buyer prompts are asked to every AI
				engine, Elmo records whether each answer mentions you, where you rank and which sources were cited, then turns
				the gaps into prioritized actions.
			</figcaption>

			<div className="relative overflow-hidden rounded-2xl bg-zinc-50/80 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.03),0_40px_80px_-24px_rgb(37_99_235/0.25)]">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(24_24_27/0.13)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,rgb(0_0_0/0.5))]"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute left-1/2 top-[55%] h-40 w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/15 blur-3xl max-xl:hidden"
				/>

				<div className="relative flex h-11 items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/70 px-4 backdrop-blur-sm">
					<p className="flex min-w-0 items-center gap-2 text-[12px] text-zinc-600">
						<span className="inline-flex h-5 items-center rounded-full bg-amber-50 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-600/20">
							Example
						</span>
						<span className="truncate">
							<span className="font-medium text-zinc-900">Acme Outdoor</span>
							<span className="text-zinc-500">
								{" "}
								· sample brand<span className="max-sm:hidden">, illustrative data</span>
							</span>
						</span>
					</p>
					<p className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400 md:flex">
						From prompt to playbook
					</p>
				</div>

				<div className="relative p-4 sm:p-6 xl:p-7">
					{/* Desktop: four stages left to right, joined by wires. */}
					<div className="hidden xl:grid xl:grid-cols-[minmax(0,0.95fr)_56px_minmax(0,0.78fr)_40px_minmax(0,1.3fr)_56px_minmax(0,1.12fr)] xl:grid-rows-[auto_350px] xl:gap-y-3">
						<StepLabel n="01">Prompts</StepLabel>
						<span />
						<StepLabel n="02">Engines</StepLabel>
						<span />
						<StepLabel n="03">Results</StepLabel>
						<span />
						<StepLabel n="04">Actions</StepLabel>

						<PromptsCard />
						<Connector width={56} from={[MID]} to={engineRows} active={ACTIVE_ROW} gradId="a2-g1" delay={1} />
						<EnginesCard />
						<Connector width={40} from={engineRows} to={engineRows} active={ACTIVE_ROW} gradId="a2-g2" delay={2} />
						<ResultsCard />
						<Connector width={56} from={engineRows} to={[MID]} active={ACTIVE_ROW} gradId="a2-g3" delay={3} />
						<ActionsCard />
					</div>

					{/* Mobile and tablet: the same flow, running downward. */}
					<div className="mx-auto flex max-w-xl flex-col gap-2.5 xl:hidden">
						<StepLabel n="01">Prompts</StepLabel>
						<PromptsCard />
						<DownConnector gradId="a2-m1" delay={1} />
						<StepLabel n="02">Engines</StepLabel>
						<EnginesCard />
						<DownConnector gradId="a2-m2" delay={2} />
						<StepLabel n="03">Results</StepLabel>
						<ResultsCard />
						<DownConnector gradId="a2-m3" delay={3} />
						<StepLabel n="04">Actions</StepLabel>
						<ActionsCard />
					</div>
				</div>
			</div>
		</figure>
	);
}
