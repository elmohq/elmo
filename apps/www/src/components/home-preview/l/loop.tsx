import { ArrowRight, Check, CircleDashed, Lightbulb, RefreshCw } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MODELS } from "./models";
import { ACCENT_GRADIENT } from "./ui";

// Every value here is illustrative. Loftwell, Uplane, Deskhaven, Riserly and
// deskreviewlab.com are made up so nobody reads this as a customer's results.

export const LOOP_ENGINES = ["Perplexity", "ChatGPT", "Claude", "Gemini", "Copilot"] as const;
export type LoopEngine = (typeof LOOP_ENGINES)[number];

const YOU = "Loftwell";
const PROMPT = "What's the best standing desk for a small home office?";

interface Pick {
	brand: string;
	why: string;
	cite: number;
}

interface Answer {
	lead: string;
	picks: [Pick, Pick, Pick];
	sources: [string, string];
}

const ANSWERS: Record<LoopEngine, Answer> = {
	Perplexity: {
		lead: "For tight spaces, reviewers keep landing on three:",
		picks: [
			{ brand: "Uplane Pro", why: "quiet dual motor, compact top", cite: 1 },
			{ brand: "Deskhaven Flex", why: "best value, very stable", cite: 2 },
			{ brand: "Riserly One", why: "budget pick under $300", cite: 1 },
		],
		sources: ["deskreviewlab.com", "reddit.com"],
	},
	ChatGPT: {
		lead: "Three solid options for a small room:",
		picks: [
			{ brand: "Deskhaven Flex", why: "stable at full height", cite: 1 },
			{ brand: "Uplane Pro", why: "quietest motor tested", cite: 2 },
			{ brand: "Loftwell Compact", why: "narrowest frame here", cite: 1 },
		],
		sources: ["reddit.com", "deskreviewlab.com"],
	},
	Claude: {
		lead: "A few desks come up again and again:",
		picks: [
			{ brand: "Uplane Pro", why: "reliable, long warranty", cite: 1 },
			{ brand: "Loftwell Compact", why: "built for small rooms", cite: 2 },
			{ brand: "Deskhaven Flex", why: "most stable frame", cite: 1 },
		],
		sources: ["deskreviewlab.com", "loftwell.com"],
	},
	Gemini: {
		lead: "Popular picks for compact home offices:",
		picks: [
			{ brand: "Uplane Pro", why: "top-rated overall", cite: 1 },
			{ brand: "Riserly One", why: "cheapest electric desk", cite: 2 },
			{ brand: "Deskhaven Flex", why: "wobble-free", cite: 2 },
		],
		sources: ["uplane.com", "deskreviewlab.com"],
	},
	Copilot: {
		lead: "Based on recent reviews, consider:",
		picks: [
			{ brand: "Deskhaven Flex", why: "editor's choice", cite: 1 },
			{ brand: "Uplane Pro", why: "quiet and fast", cite: 1 },
			{ brand: "Riserly One", why: "good on a budget", cite: 2 },
		],
		sources: ["deskreviewlab.com", "youtube.com"],
	},
};

const SHARE = [
	{ brand: "Uplane", pct: 32 },
	{ brand: "Deskhaven", pct: 28 },
	{ brand: "Riserly", pct: 17 },
	{ brand: YOU, pct: 14, you: true },
];

const SOURCES = [
	{ domain: "deskreviewlab.com", type: "Review site", pct: 31, status: "gap" as const, note: "Doesn't name you" },
	{ domain: "reddit.com", type: "Forum", pct: 22, status: "weak" as const, note: "Rarely names you" },
	{ domain: "uplane.com", type: "Competitor", pct: 12, status: "gap" as const, note: "Competitor's page" },
];

const ACTIONS = [
	{
		impact: "High",
		kind: "Pitch",
		title: "Get into deskreviewlab.com's roundup",
		why: "The most-cited source. It names Uplane and Deskhaven, not you.",
	},
	{
		impact: "Med",
		kind: "Engage",
		title: "Join the r/HomeOffice desk threads",
		why: "Reddit is the #2 source, and you're rarely in it.",
	},
	{
		impact: "Low",
		kind: "Create",
		title: "Publish Loftwell vs. Uplane",
		why: "Comparison answers cite uplane.com's own page.",
	},
];

type LinkKind = "named" | "you" | "missing" | "primary" | "secondary";
interface LinkSpec {
	from: string;
	to: string;
	kind: LinkKind;
}

const loopCss = `
@media (prefers-reduced-motion: no-preference) {
	.l-flow { animation: l-flow 1.2s linear infinite; }
	.l-flow-slow { animation: l-flow 2.4s linear infinite; }
	.l-pulse { animation: l-pulse 3s cubic-bezier(.45,0,.25,1) infinite; }
	.l-pulse-2 { animation-delay: 1s; }
	.l-fade { animation: l-fade .5s cubic-bezier(.2,.8,.2,1); }
}
@media (prefers-reduced-motion: reduce) { .l-pulse { display: none; } }
@keyframes l-flow { to { stroke-dashoffset: -16; } }
@keyframes l-pulse { 0% { stroke-dashoffset: 14; opacity: 0; } 10% { opacity: 1; } 85% { opacity: 1; } 100% { stroke-dashoffset: -100; opacity: 0; } }
@keyframes l-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
`;

function iconFor(name: string) {
	return MODELS.find((m) => m.name === name)?.icon ?? MODELS[0].icon;
}

const CARD_CLS =
	"relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgb(30_58_138/0.08),0_1px_2px_rgb(30_58_138/0.05),0_24px_48px_-24px_rgb(30_58_138/0.28)]";

function StageLabel({ n, title, sub }: { n: number; title: string; sub: string }) {
	return (
		<div className="mb-3.5 flex items-start gap-3 px-1">
			<span
				className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white ${ACCENT_GRADIENT}`}
			>
				{n}
			</span>
			<div>
				<h3 className="text-[15px] font-semibold leading-tight text-slate-950">{title}</h3>
				<p className="mt-0.5 text-[13px] leading-snug text-slate-500">{sub}</p>
			</div>
		</div>
	);
}

function CardHeader({ children, meta }: { children: React.ReactNode; meta?: React.ReactNode }) {
	return (
		<div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4">
			<div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-slate-950">{children}</div>
			{meta ? <div className="shrink-0 text-[11px] text-slate-500">{meta}</div> : null}
		</div>
	);
}

function BrandName({ name }: { name: string }) {
	const you = name.startsWith(YOU);
	return (
		<span
			className={`rounded px-1 py-px font-semibold ${you ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"}`}
		>
			{name}
		</span>
	);
}

function AnswerCard({ engine, onPick }: { engine: LoopEngine; onPick: (engine: LoopEngine) => void }) {
	const answer = ANSWERS[engine];
	const Icon = iconFor(engine);
	const youRank = answer.picks.findIndex((p) => p.brand.startsWith(YOU));
	return (
		<div className={CARD_CLS} data-card="answer">
			<CardHeader
				meta={
					<fieldset className="flex items-center gap-0.5">
						<legend className="sr-only">Show the answer from</legend>
						{LOOP_ENGINES.map((e) => {
							const EIcon = iconFor(e);
							const active = e === engine;
							return (
								<button
									key={e}
									type="button"
									aria-label={e}
									aria-pressed={active}
									onClick={() => onPick(e)}
									className={`inline-flex size-6 items-center justify-center rounded-md p-[5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${
										active ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
									}`}
								>
									<EIcon />
								</button>
							);
						})}
					</fieldset>
				}
			>
				<span className="size-4 shrink-0 text-slate-900">
					<Icon />
				</span>
				<span className="truncate">{engine}</span>
			</CardHeader>

			<div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
				<p className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-slate-100 px-3 py-2 text-[12.5px] leading-snug text-slate-700">
					{PROMPT}
				</p>

				<div key={engine} className="l-fade mt-3.5 flex flex-1 flex-col">
					<p className="text-[12.5px] text-slate-600">{answer.lead}</p>
					<ol className="mt-2 space-y-1.5">
						{answer.picks.map((p, i) => (
							<li
								key={p.brand}
								data-port={`pick-${i}`}
								className="flex items-baseline gap-2 text-[12.5px] leading-snug text-slate-700"
							>
								<span className="w-3 shrink-0 text-right tabular-nums text-slate-400">{i + 1}.</span>
								<span className="min-w-0">
									<BrandName name={p.brand} /> <span className="text-slate-500">{p.why}</span>
									<sup className="ml-0.5 text-[9px] font-semibold text-blue-600">{p.cite}</sup>
								</span>
							</li>
						))}
					</ol>
					<div
						data-port="you"
						className={`mt-3 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] ${
							youRank >= 0
								? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/15"
								: "bg-amber-50 text-amber-900 ring-1 ring-amber-500/25 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgb(245_158_11/0.06)_6px_12px)]"
						}`}
					>
						{youRank >= 0 ? (
							<Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
						) : (
							<CircleDashed className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
						)}
						<span>
							<span className="font-semibold">{YOU}</span>{" "}
							{youRank >= 0 ? `named at #${youRank + 1}` : "isn't named in this answer"}
						</span>
					</div>
					<p className="mt-3 text-[12.5px] leading-snug text-slate-600">
						Measure your space first: most compact frames start around 48 inches wide.
					</p>
					<div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3.5 text-[11px] text-slate-500">
						<span className="mr-0.5">Cited</span>
						{answer.sources.map((s, i) => (
							<span
								key={s}
								className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200"
							>
								<span className="font-semibold text-blue-600">{i + 1}</span>
								{s}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function MeasuredCard() {
	return (
		<div className={CARD_CLS} data-card="measured">
			<CardHeader meta="5 engines · last 7 days">
				<span className="inline-flex size-4 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white">
					L
				</span>
				{YOU}
			</CardHeader>
			<div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
				<dl data-port="metrics" className="grid grid-cols-3 gap-2">
					{[
						{ k: "Visibility", v: "38%", d: "of answers" },
						{ k: "Avg. rank", v: "#2.6", d: "when named" },
						{ k: "Share of voice", v: "14%", d: "of mentions" },
					].map((m) => (
						<div key={m.k} className="rounded-lg bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
							<dt className="truncate text-[10.5px] text-slate-500">{m.k}</dt>
							<dd className="mt-0.5 text-lg font-semibold leading-none tracking-tight text-slate-950 tabular-nums">
								{m.v}
							</dd>
							<dd className="mt-1 truncate text-[10px] text-slate-400">{m.d}</dd>
						</div>
					))}
				</dl>

				<div className="mt-4">
					<p className="text-[11px] font-medium text-slate-500">Share of voice</p>
					<div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
						{SHARE.map((s) => (
							<span
								key={s.brand}
								style={{ width: `${s.pct}%` }}
								className={`h-full border-r-2 border-white last:border-r-0 ${s.you ? ACCENT_GRADIENT : "bg-slate-300"}`}
							/>
						))}
					</div>
					<ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500">
						{SHARE.map((s) => (
							<li key={s.brand} className={s.you ? "font-semibold text-blue-700" : ""}>
								{s.brand} {s.pct}%
							</li>
						))}
					</ul>
				</div>

				<div className="mt-4 border-t border-slate-100 pt-3">
					<p className="text-[11px] font-medium text-slate-500">Top cited sources</p>
					<ul className="mt-1.5 space-y-1">
						{SOURCES.map((s, i) => (
							<li
								key={s.domain}
								data-port={`source-${i}`}
								className="flex items-center gap-2 rounded-md py-1 text-[12px]"
							>
								<span className="w-7 shrink-0 text-right font-semibold tabular-nums text-slate-950">{s.pct}%</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-mono text-[11.5px] text-slate-800">{s.domain}</span>
									<span className="block text-[10.5px] text-slate-400">{s.type}</span>
								</span>
								<span
									className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
										s.status === "gap"
											? "bg-amber-50 text-amber-800 ring-1 ring-amber-500/25"
											: "bg-slate-100 text-slate-600"
									}`}
								>
									{s.note}
								</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

function ActionCard() {
	return (
		<div className={CARD_CLS} data-card="action">
			<CardHeader meta="Ranked by impact">
				<Lightbulb className="size-4 text-blue-600" aria-hidden="true" />
				Opportunities
			</CardHeader>
			<ul className="flex flex-1 flex-col gap-2 p-2.5">
				{ACTIONS.map((a, i) => (
					<li
						key={a.title}
						data-port={`action-${i}`}
						className={`relative rounded-xl px-3 py-2.5 ${
							i === 0
								? "bg-blue-50/70 shadow-[inset_0_0_0_1px_rgb(37_99_235/0.25)]"
								: "shadow-[inset_0_0_0_1px_rgb(15_23_42/0.06)]"
						}`}
					>
						<p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
							<span
								className={`rounded px-1.5 py-0.5 ${
									i === 0 ? `${ACCENT_GRADIENT} text-white` : "bg-slate-100 text-slate-600"
								}`}
							>
								{a.impact}
							</span>
							<span className="text-slate-400">{a.kind}</span>
						</p>
						<p className="mt-1.5 text-[13px] font-semibold leading-snug text-slate-950">{a.title}</p>
						<p className="mt-0.5 text-[12px] leading-snug text-slate-500">{a.why}</p>
					</li>
				))}
			</ul>
			<div className="flex h-10 shrink-0 items-center gap-1.5 border-t border-slate-100 bg-slate-50/70 px-4 text-[11px] text-slate-500">
				Generated from your answer data
				<ArrowRight className="size-3" aria-hidden="true" />
			</div>
		</div>
	);
}

interface Drawn {
	links: { d: string; kind: LinkKind; x1: number; y1: number; x2: number; y2: number }[];
	loop?: { d: string; midY: number; midX: number };
	width: number;
	height: number;
}

/**
 * Finds each port's row and the card edge it sits on, so the connecting lines
 * land on the exact rows they refer to at any desktop width.
 */
function useWires(links: LinkSpec[]) {
	const ref = useRef<HTMLDivElement>(null);
	const [drawn, setDrawn] = useState<Drawn | null>(null);

	const measure = useCallback(() => {
		const root = ref.current;
		if (!root) return;
		const box = root.getBoundingClientRect();
		if (window.innerWidth < 1024) {
			setDrawn(null);
			return;
		}
		const at = (port: string, side: "right" | "left") => {
			const el = root.querySelector<HTMLElement>(`[data-port="${port}"]`);
			const card = el?.closest<HTMLElement>("[data-card]");
			if (!el || !card) return null;
			const r = el.getBoundingClientRect();
			const c = card.getBoundingClientRect();
			return { x: (side === "right" ? c.right : c.left) - box.left, y: r.top + r.height / 2 - box.top };
		};
		const out: Drawn["links"] = [];
		for (const l of links) {
			const a = at(l.from, "right");
			const b = at(l.to, "left");
			if (!a || !b) continue;
			const mid = (b.x - a.x) / 2;
			out.push({
				d: `M${a.x} ${a.y} C${a.x + mid} ${a.y} ${b.x - mid} ${b.y} ${b.x} ${b.y}`,
				kind: l.kind,
				x1: a.x,
				y1: a.y,
				x2: b.x,
				y2: b.y,
			});
		}
		const first = root.querySelector<HTMLElement>('[data-card="answer"]')?.getBoundingClientRect();
		const last = root.querySelector<HTMLElement>('[data-card="action"]')?.getBoundingClientRect();
		let loop: Drawn["loop"];
		if (first && last) {
			const x1 = last.left + last.width / 2 - box.left;
			const x2 = first.left + first.width / 2 - box.left;
			const y = Math.max(first.bottom, last.bottom) - box.top;
			const depth = 84;
			loop = {
				d: `M${x1} ${y + 2} C${x1} ${y + depth} ${x2} ${y + depth} ${x2} ${y + 10}`,
				midY: y + depth * 0.75,
				midX: (x1 + x2) / 2,
			};
		}
		const next = { links: out, loop, width: box.width, height: box.height };
		// Redrawing the wires is itself a DOM mutation, so only commit real changes.
		setDrawn((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
	}, [links]);

	useLayoutEffect(() => {
		measure();
		const root = ref.current;
		if (!root) return;
		const ro = new ResizeObserver(measure);
		ro.observe(root);
		// Switching engines swaps the answer text, which moves rows without resizing anything.
		const mo = new MutationObserver(measure);
		mo.observe(root, { childList: true, subtree: true, characterData: true });
		document.fonts?.ready.then(measure);
		return () => {
			ro.disconnect();
			mo.disconnect();
		};
	}, [measure]);

	return { ref, drawn };
}

const STROKES: Record<LinkKind, { stroke: string; width: number; dash?: string; flow?: boolean }> = {
	named: { stroke: "rgb(148 163 184 / 0.55)", width: 1 },
	you: { stroke: "url(#l-grad)", width: 1.75, flow: true },
	missing: { stroke: "rgb(245 158 11 / 0.8)", width: 1.25, dash: "3 4" },
	primary: { stroke: "url(#l-grad)", width: 1.75, flow: true },
	secondary: { stroke: "rgb(148 163 184 / 0.6)", width: 1 },
};

function WireLink({ link: l }: { link: Drawn["links"][number] }) {
	const s = STROKES[l.kind];
	const hot = l.kind === "primary" || l.kind === "you";
	return (
		<g>
			{hot ? <path d={l.d} fill="none" stroke="rgb(59 130 246 / 0.35)" strokeWidth={6} filter="url(#l-glow)" /> : null}
			<path d={l.d} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} />
			{s.flow ? (
				<path
					d={l.d}
					fill="none"
					pathLength={100}
					stroke="white"
					strokeWidth={2.5}
					strokeLinecap="round"
					strokeDasharray="8 200"
					strokeDashoffset={14}
					className={`l-pulse ${l.kind === "primary" ? "l-pulse-2" : ""}`}
				/>
			) : null}
			<circle
				cx={l.x1}
				cy={l.y1}
				r={2.75}
				fill="white"
				stroke={hot ? "#2563eb" : l.kind === "missing" ? "#f59e0b" : "#cbd5e1"}
				strokeWidth={1.25}
			/>
			<circle
				cx={l.x2}
				cy={l.y2}
				r={2.75}
				fill="white"
				stroke={hot ? "#2563eb" : l.kind === "missing" ? "#f59e0b" : "#cbd5e1"}
				strokeWidth={1.25}
			/>
		</g>
	);
}

function Wires({ drawn }: { drawn: Drawn }) {
	const ordered = [...drawn.links].sort(
		(a, b) => Number(a.kind === "primary" || a.kind === "you") - Number(b.kind === "primary" || b.kind === "you"),
	);
	return (
		<svg
			aria-hidden="true"
			width={drawn.width}
			height={drawn.height}
			className="pointer-events-none absolute inset-0 hidden overflow-visible lg:block"
		>
			<defs>
				<linearGradient id="l-grad" x1="0" y1="0" x2="1" y2="0">
					<stop offset="0" stopColor="#60a5fa" />
					<stop offset="0.5" stopColor="#2563eb" />
					<stop offset="1" stopColor="#0ea5e9" />
				</linearGradient>
				<linearGradient
					id="l-loop"
					gradientUnits="userSpaceOnUse"
					x1={drawn.loop ? drawn.loop.midX * 2 : 0}
					y1="0"
					x2="0"
					y2="0"
				>
					<stop offset="0" stopColor="#0ea5e9" />
					<stop offset="1" stopColor="#2563eb" />
				</linearGradient>
				<marker id="l-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
					<path d="M1 1 L9 5 L1 9 z" fill="#2563eb" />
				</marker>
				<filter id="l-glow" x="-20%" y="-50%" width="140%" height="200%">
					<feGaussianBlur stdDeviation="3" />
				</filter>
			</defs>
			{ordered.map((l) => (
				<WireLink key={`${l.kind}-${l.d}`} link={l} />
			))}
			{drawn.loop ? (
				<g>
					<path
						d={drawn.loop.d}
						fill="none"
						stroke="url(#l-loop)"
						strokeWidth={1.5}
						strokeDasharray="5 5"
						strokeLinecap="round"
						markerEnd="url(#l-arrow)"
						className="l-flow-slow"
					/>
				</g>
			) : null}
		</svg>
	);
}

function DownWire({ label }: { label: string }) {
	return (
		<div aria-hidden="true" className="flex items-center gap-3 py-3 pl-[18px] lg:hidden">
			<span className={`h-9 w-[2px] rounded-full ${ACCENT_GRADIENT}`} />
			<span className="text-[12px] text-slate-500">{label}</span>
		</div>
	);
}

function LoopNote({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
	return (
		<p
			style={style}
			className={`inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] text-slate-600 shadow-[0_0_0_1px_rgb(30_58_138/0.08),0_6px_16px_-8px_rgb(30_58_138/0.25)] ${className}`}
		>
			<RefreshCw className="size-3.5 text-blue-600" aria-hidden="true" />
			<span>
				<span className="font-medium text-slate-900">Elmo re-asks on a schedule,</span> so you see whether the fix
				worked.
			</span>
		</p>
	);
}

export function LoopDiagram({ engine, onPick }: { engine: LoopEngine; onPick: (engine: LoopEngine) => void }) {
	const youNamed = ANSWERS[engine].picks.some((p) => p.brand.startsWith(YOU));
	const links = useMemo<LinkSpec[]>(
		() => [
			{ from: "pick-0", to: "metrics", kind: "named" },
			{ from: "pick-1", to: "metrics", kind: "named" },
			{ from: "pick-2", to: "metrics", kind: "named" },
			{ from: "you", to: "metrics", kind: youNamed ? "you" : "missing" },
			{ from: "source-0", to: "action-0", kind: "primary" },
			{ from: "source-1", to: "action-1", kind: "secondary" },
			{ from: "source-2", to: "action-2", kind: "secondary" },
		],
		[youNamed],
	);
	const { ref, drawn } = useWires(links);

	return (
		<div>
			<style>{loopCss}</style>
			<div className="mb-5 flex flex-wrap items-center justify-between gap-2 px-1">
				<p className="flex items-center gap-2 text-[12.5px] text-slate-500">
					<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-900">
						Example
					</span>
					<span>
						<span className="font-medium text-slate-800">Loftwell</span> is a fictional standing-desk brand ·
						illustrative data
					</span>
				</p>
				<p className="hidden text-[12.5px] text-slate-500 lg:block">Pick an engine to see its answer</p>
			</div>
			<div ref={ref} className="relative lg:pb-28">
				<div className="grid lg:grid-cols-3 lg:gap-14 xl:gap-16">
					<div className="flex flex-col">
						<StageLabel n={1} title="The answer" sub="What AI tells your buyers, and who it names." />
						<div className="flex-1">
							<AnswerCard engine={engine} onPick={onPick} />
						</div>
					</div>
					<DownWire label="Measured across every answer" />
					<div className="flex flex-col">
						<StageLabel n={2} title="What Elmo measures" sub="Across every prompt, engine and run." />
						<div className="flex-1">
							<MeasuredCard />
						</div>
					</div>
					<DownWire label="Turned into next steps" />
					<div className="flex flex-col">
						<StageLabel n={3} title="What to fix next" sub="Where to show up so the answer changes." />
						<div className="flex-1">
							<ActionCard />
						</div>
					</div>
				</div>
				{drawn ? <Wires drawn={drawn} /> : null}
				{drawn?.loop ? (
					<div
						className="absolute hidden -translate-x-1/2 -translate-y-1/2 lg:block"
						style={{ left: drawn.loop.midX, top: drawn.loop.midY }}
					>
						<LoopNote />
					</div>
				) : null}
				<div className="mt-5 flex justify-center lg:hidden">
					<LoopNote className="text-left" />
				</div>
			</div>
		</div>
	);
}
