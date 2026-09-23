import { useLoaderData } from "@tanstack/react-router";
import {
	ArrowUpRight,
	Check,
	Copy,
	Eye,
	Lightbulb,
	Link2,
	type LucideIcon,
	PieChart,
	Search,
	Sparkles,
	Star,
	Terminal,
} from "lucide-react";
import { useState } from "react";
import { formatStarCount } from "@/lib/github-stars";
import { MODELS } from "./models";

const BRAND = "Fernwood";
const PROMPT = "best mattress for lower back pain";

// Tiles rise in one after another; the static end state is what a screenshot or
// a reduced-motion visitor sees.
const bentoCss = `
@keyframes bento-in { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes bento-draw { from { stroke-dashoffset: 100; } }
.bento-tile { animation: bento-in 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: calc(var(--i, 0) * 80ms + 120ms); }
.bento-draw { animation: bento-draw 1400ms cubic-bezier(0.3, 0.7, 0.2, 1) both; animation-delay: 500ms; }
@media (prefers-reduced-motion: reduce) { .bento-tile, .bento-draw { animation: none; } }
`;

function Tile({
	index,
	icon: Icon,
	label,
	meta,
	className = "",
	dark = false,
	children,
}: {
	index: number;
	icon: LucideIcon;
	label: string;
	meta?: React.ReactNode;
	className?: string;
	dark?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			style={{ "--i": index } as React.CSSProperties}
			className={`bento-tile group relative flex flex-col overflow-hidden rounded-2xl p-5 transition-[translate,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-0.5 ${
				dark
					? "bg-zinc-950 text-zinc-100 shadow-[0_0_0_1px_rgb(24_24_27/1),0_12px_32px_-16px_rgb(24_24_27/0.5)] hover:shadow-[0_0_0_1px_rgb(24_24_27/1),0_24px_48px_-20px_rgb(24_24_27/0.6)]"
					: "bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)] hover:shadow-[0_0_0_1px_rgb(37_99_235/0.3),0_20px_40px_-20px_rgb(37_99_235/0.35)]"
			} ${className}`}
		>
			<div className="flex items-center justify-between gap-3">
				<p
					className={`flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] ${dark ? "text-zinc-400" : "text-zinc-500"}`}
				>
					<Icon
						className={`size-3.5 transition-colors ${dark ? "text-zinc-500" : "text-zinc-400 group-hover:text-blue-600"}`}
						aria-hidden="true"
					/>
					{label}
				</p>
				{meta ? <div className={`text-[11px] ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{meta}</div> : null}
			</div>
			<div className="mt-4 flex flex-1 flex-col">{children}</div>
		</div>
	);
}

const TREND = [
	48, 49, 47, 50, 51, 50, 52, 53, 52, 54, 53, 55, 56, 55, 57, 56, 58, 59, 58, 60, 59, 61, 62, 61, 63, 62, 63, 64, 63,
	64,
];

function sparkPath(values: number[], w: number, h: number) {
	const min = Math.min(...values) - 2;
	const max = Math.max(...values) + 2;
	return values
		.map((v, i) => {
			const x = (i / (values.length - 1)) * w;
			const y = h - ((v - min) / (max - min)) * h;
			return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
		})
		.join(" ");
}

function VisibilityTile() {
	const score = TREND[TREND.length - 1];
	const line = sparkPath(TREND, 280, 64);
	return (
		<Tile index={0} icon={Eye} label="AI visibility" meta="Last 30 days" className="lg:col-span-2 lg:row-span-2">
			<div className="relative mx-auto mt-2 w-full max-w-[240px]">
				<svg viewBox="0 0 200 110" className="w-full" aria-hidden="true">
					<path
						d="M 16 100 A 84 84 0 0 1 184 100"
						pathLength={100}
						fill="none"
						className="stroke-zinc-100"
						strokeWidth="14"
						strokeLinecap="round"
					/>
					<path
						d="M 16 100 A 84 84 0 0 1 184 100"
						pathLength={100}
						fill="none"
						className="bento-draw stroke-blue-600"
						strokeWidth="14"
						strokeLinecap="round"
						strokeDasharray={`${score} 100`}
					/>
				</svg>
				<div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
					<p className="text-5xl font-semibold tracking-[-0.04em] text-zinc-950 tabular-nums">
						{score}
						<span className="text-2xl text-zinc-400">%</span>
					</p>
				</div>
			</div>
			<p className="mt-2 text-center text-[13px] text-zinc-500">
				of AI answers mention <span className="font-medium text-zinc-900">{BRAND}</span>
			</p>

			<div className="mt-auto pt-6">
				<div className="flex items-baseline justify-between text-[12px]">
					<span className="text-zinc-500">30-day trend</span>
					<span className="font-medium text-emerald-600 tabular-nums">+16 pts</span>
				</div>
				<svg
					viewBox="0 0 280 72"
					className="mt-2 h-16 w-full overflow-visible"
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<defs>
						<linearGradient id="bento-spark" x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
							<stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
						</linearGradient>
					</defs>
					<path d={`${line} L280 72 L0 72 Z`} fill="url(#bento-spark)" />
					<path
						d={line}
						pathLength={100}
						strokeDasharray="100"
						fill="none"
						stroke="#2563eb"
						strokeWidth="2"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
						className="bento-draw"
					/>
				</svg>
				<div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4 text-[12px]">
					<div>
						<p className="text-zinc-500">Avg. rank</p>
						<p className="mt-0.5 text-base font-semibold text-zinc-950 tabular-nums">#1.8</p>
					</div>
					<div>
						<p className="text-zinc-500">Prompts tracked</p>
						<p className="mt-0.5 text-base font-semibold text-zinc-950 tabular-nums">42</p>
					</div>
				</div>
			</div>
		</Tile>
	);
}

const ENGINE_RESULTS: { name: string; rank: number | null }[] = [
	{ name: "ChatGPT", rank: 1 },
	{ name: "Claude", rank: 2 },
	{ name: "Gemini", rank: 1 },
	{ name: "Perplexity", rank: 3 },
	{ name: "Copilot", rank: null },
	{ name: "Grok", rank: 2 },
	{ name: "DeepSeek", rank: null },
	{ name: "Google AI Overviews", rank: 1 },
];

function EnginesTile() {
	const named = ENGINE_RESULTS.filter((e) => e.rank !== null).length;
	return (
		<Tile
			index={1}
			icon={Sparkles}
			label="Mentions by engine"
			meta={
				<span className="tabular-nums">
					{named} of {ENGINE_RESULTS.length} name you
				</span>
			}
			className="lg:col-span-2"
		>
			<ul className="grid grid-cols-2 gap-1.5">
				{ENGINE_RESULTS.map((e) => {
					const model = MODELS.find((m) => m.name === e.name);
					const Icon = model?.icon;
					const hit = e.rank !== null;
					return (
						<li
							key={e.name}
							className={`flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12px] ring-1 transition-colors ${
								hit
									? "bg-white text-zinc-800 ring-zinc-200 group-hover:ring-blue-200"
									: "bg-zinc-50 text-zinc-400 ring-zinc-100"
							}`}
						>
							<span className={`size-3.5 shrink-0 ${hit ? "text-zinc-900" : "text-zinc-300"}`}>
								{Icon ? <Icon /> : null}
							</span>
							<span className="min-w-0 flex-1 truncate">
								{e.name === "Google AI Overviews" ? "AI Overviews" : e.name}
							</span>
							{hit ? (
								<span className="rounded bg-blue-50 px-1 font-mono text-[10.5px] font-medium text-blue-700 tabular-nums">
									#{e.rank}
								</span>
							) : (
								<span className="font-mono text-[10.5px]">—</span>
							)}
						</li>
					);
				})}
			</ul>
		</Tile>
	);
}

const SOV = [
	{ name: BRAND, value: 31, color: "stroke-blue-600", dot: "bg-blue-600" },
	{ name: "Duskwell", value: 26, color: "stroke-zinc-500", dot: "bg-zinc-500" },
	{ name: "Hushline", value: 22, color: "stroke-zinc-300", dot: "bg-zinc-300" },
	{ name: "Others", value: 21, color: "stroke-zinc-200", dot: "bg-zinc-200" },
];

function ShareOfVoiceTile() {
	let offset = 0;
	return (
		<Tile index={2} icon={PieChart} label="Share of voice" meta="vs. competitors" className="lg:col-span-2">
			<div className="flex flex-1 items-center gap-5">
				<div className="relative size-[120px] shrink-0">
					<svg
						viewBox="0 0 100 100"
						className="size-full -rotate-90 transition-transform duration-700 ease-out motion-safe:group-hover:rotate-[-80deg]"
						aria-hidden="true"
					>
						{SOV.map((s) => {
							const dash = `${s.value - 1.5} ${100 - s.value + 1.5}`;
							const el = (
								<circle
									key={s.name}
									cx="50"
									cy="50"
									r="40"
									fill="none"
									pathLength={100}
									strokeWidth="14"
									strokeDasharray={dash}
									strokeDashoffset={-offset}
									className={s.color}
								/>
							);
							offset += s.value;
							return el;
						})}
					</svg>
					<div className="absolute inset-0 flex flex-col items-center justify-center">
						<span className="text-xl font-semibold tracking-[-0.03em] text-zinc-950 tabular-nums">31%</span>
						<span className="text-[10px] text-zinc-500">#1 of 7</span>
					</div>
				</div>
				<ul className="min-w-0 flex-1 space-y-2 text-[12.5px]">
					{SOV.map((s) => (
						<li key={s.name} className="flex items-center gap-2">
							<span className={`size-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
							<span className={`flex-1 truncate ${s.name === BRAND ? "font-medium text-zinc-950" : "text-zinc-600"}`}>
								{s.name}
							</span>
							<span className="font-mono text-[11.5px] text-zinc-500 tabular-nums">{s.value}%</span>
						</li>
					))}
				</ul>
			</div>
		</Tile>
	);
}

const FAN_OUT = [
	"best mattress for back pain 2026",
	"firm vs medium mattress lower back",
	"fernwood vs duskwell reddit",
	"orthopedic hybrid mattress reviews",
	"lumbar support for side sleepers",
];

function FanOutTile() {
	const chatgpt = MODELS.find((m) => m.name === "ChatGPT");
	const ChatGPTIcon = chatgpt?.icon;
	return (
		<Tile
			index={3}
			icon={Search}
			label="Query fan-out"
			meta={<span className="tabular-nums">1 prompt → {FAN_OUT.length} searches</span>}
			className="md:col-span-2 lg:col-span-2 lg:row-span-2"
		>
			<div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
				<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Prompt</p>
				<p className="mt-1 text-[14px] font-medium text-zinc-950">“{PROMPT}”</p>
			</div>

			<div className="relative mb-5 ml-4 mt-1">
				<p className="flex items-center gap-2 py-3 pl-5 text-[12px] text-zinc-500">
					<span className="inline-flex size-5 items-center justify-center rounded-md bg-zinc-900 p-1 text-white">
						{ChatGPTIcon ? <ChatGPTIcon /> : null}
					</span>
					ChatGPT searched the web for
				</p>
				<span
					aria-hidden="true"
					className="absolute bottom-4 left-0 top-0 w-px bg-zinc-200 transition-colors group-hover:bg-blue-300"
				/>
				<ul className="space-y-1.5">
					{FAN_OUT.map((q) => (
						<li key={q} className="relative pl-5">
							<span
								aria-hidden="true"
								className="absolute left-0 top-1/2 h-px w-4 bg-zinc-200 transition-colors group-hover:bg-blue-300"
							/>
							<span className="flex h-8 items-center gap-2 rounded-lg bg-white px-2.5 font-mono text-[11.5px] text-zinc-700 ring-1 ring-zinc-200 transition-colors group-hover:ring-zinc-300">
								<Search className="size-3 shrink-0 text-zinc-400" aria-hidden="true" />
								<span className="truncate">{q}</span>
							</span>
						</li>
					))}
				</ul>
			</div>

			<div className="mt-auto border-t border-zinc-100 pt-4">
				<p className="text-[12px] text-zinc-500">Keywords AI added to your prompt</p>
				<ul className="mt-2 flex flex-wrap gap-1.5">
					{["2026", "firm vs medium", "reddit", "orthopedic", "side sleepers"].map((k) => (
						<li key={k} className="rounded-md bg-blue-50 px-2 py-0.5 text-[11.5px] text-blue-700 ring-1 ring-blue-100">
							{k}
						</li>
					))}
				</ul>
			</div>
		</Tile>
	);
}

function OpportunityTile() {
	return (
		<Tile index={4} icon={Lightbulb} label="Opportunities" meta="Ranked by impact" className="lg:col-span-2">
			<div className="rounded-xl p-3.5 ring-1 ring-blue-200 bg-gradient-to-b from-blue-50/80 to-white transition-shadow group-hover:shadow-[0_8px_20px_-12px_rgb(37_99_235/0.5)]">
				<div className="flex items-center gap-2">
					<span className="rounded bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white">
						High
					</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Pitch a source</span>
				</div>
				<p className="mt-2 text-[14px] font-medium leading-snug text-zinc-950">
					Get into thesleepdesk.com's back-pain roundup
				</p>
				<p className="mt-1 text-[12.5px] leading-snug text-zinc-600">
					Cited in 9 answers. Names Duskwell and Hushline, not {BRAND}.
				</p>
			</div>
			<div className="mt-2 flex items-center gap-2 px-1 text-[12.5px] text-zinc-500">
				<span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
					Med
				</span>
				<span className="truncate">Refresh /firm-mattresses with lumbar specs</span>
			</div>
		</Tile>
	);
}

const SOURCES = [
	{ domain: "reddit.com", type: "Social", count: 38 },
	{ domain: "thesleepdesk.com", type: "Editorial", count: 24 },
	{ domain: "fernwood.com", type: "You", count: 17 },
	{ domain: "youtube.com", type: "Social", count: 12 },
	{ domain: "duskwell.com", type: "Competitor", count: 9 },
];

function SourcesTile() {
	const max = SOURCES[0].count;
	return (
		<Tile index={5} icon={Link2} label="Top cited sources" meta="Citations" className="lg:col-span-2">
			<ul className="space-y-2.5">
				{SOURCES.map((s) => (
					<li key={s.domain} className="text-[12.5px]">
						<div className="flex items-center gap-2">
							<span
								aria-hidden="true"
								className={`inline-flex size-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-medium uppercase ${s.type === "You" ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-500"}`}
							>
								{s.domain[0]}
							</span>
							<span className={`flex-1 truncate ${s.type === "You" ? "font-medium text-zinc-950" : "text-zinc-700"}`}>
								{s.domain}
							</span>
							<span className="text-[11px] text-zinc-400">{s.type}</span>
							<span className="w-6 text-right font-mono text-[11.5px] text-zinc-600 tabular-nums">{s.count}</span>
						</div>
						<div className="ml-6 mt-1 h-1 overflow-hidden rounded-full bg-zinc-100">
							<div
								className={`h-full origin-left rounded-full transition-transform duration-500 ${s.type === "You" ? "bg-blue-600" : "bg-zinc-300 group-hover:bg-zinc-400"}`}
								style={{ width: `${(s.count / max) * 100}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</Tile>
	);
}

const COMMANDS = ["npm install -g @elmohq/cli", "elmo init"];

function OpenSourceTile() {
	const rootData = useLoaderData({ from: "__root__" });
	const stars = rootData?.githubStars ?? 0;
	const [copied, setCopied] = useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(COMMANDS.join(" && "));
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard can be unavailable (permissions, insecure context); the commands stay selectable.
		}
	}

	return (
		<Tile
			index={6}
			dark
			icon={Terminal}
			label="Self-host"
			meta={
				<button
					type="button"
					onClick={copy}
					className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-500"
				>
					{copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
					{copied ? "Copied" : "Copy"}
				</button>
			}
			className="lg:col-span-2"
		>
			<p className="text-[15px] font-medium text-white">Your servers, your data.</p>
			<p className="mt-1 text-[12.5px] leading-snug text-zinc-400">
				The same product as the cloud, set up with Docker Compose in two commands.
			</p>
			<div className="mt-4 space-y-1.5 rounded-lg bg-zinc-900 px-3.5 py-3 font-mono text-[12.5px] text-zinc-100 ring-1 ring-zinc-800">
				<p className="flex gap-3">
					<span className="select-none text-zinc-600">$</span>
					<span>
						npm install -g <span className="text-blue-400">@elmohq/cli</span>
					</span>
				</p>
				<p className="flex gap-3">
					<span className="select-none text-zinc-600">$</span>
					<span>
						elmo init
						<span
							aria-hidden="true"
							className="ml-1 inline-block h-3.5 w-1.5 translate-y-0.5 bg-zinc-400 motion-safe:animate-pulse"
						/>
					</span>
				</p>
			</div>
			<div className="mt-auto flex items-center justify-between gap-3 pt-4">
				<p className="text-[12px] text-zinc-400">MIT licensed · free forever</p>
				<a
					href="https://github.com/elmohq/elmo"
					target="_blank"
					rel="noopener noreferrer"
					aria-label={`Star elmo on GitHub${stars ? ` (${stars} stars)` : ""}`}
					className="group/star inline-flex h-7 items-center gap-1.5 rounded-md bg-zinc-900 px-2.5 text-[12px] font-medium text-zinc-100 ring-1 ring-zinc-700 transition hover:bg-zinc-800 hover:ring-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
				>
					<Star
						className="size-3.5 text-zinc-400 transition-colors group-hover/star:fill-amber-400 group-hover/star:text-amber-400"
						aria-hidden="true"
					/>
					{stars > 0 ? <span className="tabular-nums">{formatStarCount(stars)}</span> : "Star"}
					<ArrowUpRight className="size-3 text-zinc-500" aria-hidden="true" />
				</a>
			</div>
		</Tile>
	);
}

export function HeroBento() {
	return (
		<div>
			<style>{bentoCss}</style>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-zinc-500">
				<p className="flex items-center gap-2">
					<span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.14em] text-amber-700">
						Example
					</span>
					<span>
						<span className="font-medium text-zinc-800">{BRAND} Sleep</span> is a fictional mattress brand; all data is
						illustrative.
					</span>
				</p>
				<p className="hidden font-mono text-[10.5px] uppercase tracking-[0.16em] text-zinc-400 md:block">
					Prompt · “{PROMPT}”
				</p>
			</div>
			<div className="grid gap-3 md:grid-flow-dense md:grid-cols-2 lg:grid-cols-6">
				<VisibilityTile />
				<EnginesTile />
				<ShareOfVoiceTile />
				<FanOutTile />
				<OpportunityTile />
				<SourcesTile />
				<OpenSourceTile />
			</div>
		</div>
	);
}
