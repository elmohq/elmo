// Simplified, illustrative recreations of Elmo screens for the hero tour. The
// numbers and brands are sample data, not customer results — keep them fictional.
import { ArrowDownRight, ArrowUpRight, FileText, Megaphone, MessagesSquare, RefreshCw } from "lucide-react";
import { MODELS } from "./models";

export const SAMPLE_BRAND = "Acme Trail";

function modelIcon(name: string) {
	const Icon = MODELS.find((m) => m.name === name)?.icon;
	return Icon ? <Icon /> : null;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={`rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)] ${className}`}
		>
			{children}
		</div>
	);
}

function CardLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return <p className={`text-[13px] font-medium text-zinc-500 ${className}`}>{children}</p>;
}

function Delta({ value, suffix = " pts" }: { value: number; suffix?: string }) {
	const up = value >= 0;
	const Icon = up ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={`inline-flex items-center gap-0.5 font-mono text-xs tabular-nums ${up ? "text-emerald-700" : "text-rose-700"}`}
		>
			<Icon className="size-3" aria-hidden="true" />
			{up ? "+" : "−"}
			{Math.abs(value)}
			{suffix}
		</span>
	);
}

/** Numbered pin that ties a spot in the mock to a matching annotation card. */
export function Marker({ n, className = "" }: { n: number; className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={`pointer-events-none z-10 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 font-mono text-[11px] font-medium text-white shadow-[0_0_0_4px_rgb(37_99_235/0.18)] max-lg:hidden ${className}`}
		>
			{n}
		</span>
	);
}

/* ---------------------------------------------------------------- Visibility */

const ACME_TREND = [
	52, 51, 53, 52, 54, 53, 55, 54, 56, 55, 55, 57, 56, 58, 57, 59, 58, 60, 59, 61, 60, 62, 61, 62, 63, 62, 64, 63, 64,
	64,
];
const RIVAL_TREND = [
	71, 72, 71, 70, 71, 70, 71, 69, 70, 70, 69, 70, 68, 69, 68, 69, 68, 67, 68, 67, 68, 67, 66, 67, 66, 67, 66, 66, 65,
	66,
];
const Y_MIN = 40;
const Y_MAX = 80;

function toPoints(values: number[]) {
	return values.map((v, i) => {
		const x = (i / (values.length - 1)) * 300;
		const y = 120 - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * 120;
		return [x, y] as const;
	});
}

function linePath(values: number[]) {
	return toPoints(values)
		.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
		.join(" ");
}

function TrendChart() {
	const acme = linePath(ACME_TREND);
	const last = toPoints(ACME_TREND).at(-1) ?? [300, 0];
	return (
		<div className="relative h-full min-h-0 pl-8">
			{[70, 60, 50].map((v) => (
				<div
					key={v}
					aria-hidden="true"
					className="absolute inset-x-0 flex items-center gap-2"
					style={{ top: `${((Y_MAX - v) / (Y_MAX - Y_MIN)) * 100}%` }}
				>
					<span className="w-6 -translate-y-1/2 text-right font-mono text-[10px] text-zinc-400">{v}%</span>
					<span className="h-px flex-1 -translate-y-1/2 border-t border-dashed border-zinc-200" />
				</div>
			))}
			<svg
				viewBox="0 0 300 120"
				preserveAspectRatio="none"
				className="relative size-full overflow-visible"
				aria-hidden="true"
			>
				<defs>
					<linearGradient id="a3-trend-fill" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0" stopColor="#2563eb" stopOpacity="0.18" />
						<stop offset="1" stopColor="#2563eb" stopOpacity="0" />
					</linearGradient>
				</defs>
				<path d={`${acme} L300,120 L0,120 Z`} fill="url(#a3-trend-fill)" />
				<path
					d={linePath(RIVAL_TREND)}
					fill="none"
					stroke="#a1a1aa"
					strokeWidth="1.5"
					strokeDasharray="4 4"
					vectorEffect="non-scaling-stroke"
				/>
				<path d={acme} fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" />
			</svg>
			<span
				aria-hidden="true"
				className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 ring-2 ring-white"
				style={{ left: `calc(2rem + (100% - 2rem) * ${last[0] / 300})`, top: `${(last[1] / 120) * 100}%` }}
			/>
		</div>
	);
}

const MODEL_VISIBILITY = [
	{ name: "Perplexity", value: 78 },
	{ name: "ChatGPT", value: 71 },
	{ name: "Claude", value: 62 },
	{ name: "Gemini", value: 54 },
	{ name: "Google AI Overviews", value: 38 },
];

export function VisibilityView() {
	return (
		<div className="grid h-full grid-rows-[auto_1fr] gap-3 md:gap-4">
			<div className="grid gap-3 md:grid-cols-12 md:gap-4">
				<Card className="flex flex-col justify-between p-4 md:col-span-4 md:p-5">
					<CardLabel>AI visibility</CardLabel>
					<div className="relative mt-2 flex items-end gap-3 md:mt-3">
						<span className="text-[3.25rem] font-semibold leading-none tracking-[-0.04em] text-zinc-950 tabular-nums md:text-[4.25rem]">
							64%
						</span>
						<span className="mb-2 rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-emerald-200/70">
							<Delta value={12} />
						</span>
						<Marker n={1} className="absolute -top-2 left-[8.75rem]" />
					</div>
					<p className="mt-3 text-[13px] leading-snug text-zinc-500">
						Named in <span className="font-medium text-zinc-800">1,152 of 1,800</span> AI answers
					</p>
				</Card>
				<Card className="flex flex-col p-4 max-md:hidden md:col-span-8 md:p-5">
					<div className="flex items-center justify-between">
						<CardLabel>Visibility, last 30 days</CardLabel>
						<div className="flex items-center gap-4 text-xs text-zinc-600">
							<span className="flex items-center gap-1.5">
								<span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-blue-600" />
								{SAMPLE_BRAND}
							</span>
							<span className="flex items-center gap-1.5">
								<span aria-hidden="true" className="w-3.5 border-t-[1.5px] border-dashed border-zinc-400" />
								Summit Gear
							</span>
						</div>
					</div>
					<div className="mt-3 h-[112px] flex-1">
						<TrendChart />
					</div>
				</Card>
			</div>
			<Card className="min-h-0 p-4 md:p-5">
				<div className="flex items-center justify-between">
					<CardLabel>Visibility by model</CardLabel>
					<span className="text-xs text-zinc-400 max-sm:hidden">28 prompts · 5 models</span>
				</div>
				<ul className="mt-3 space-y-2.5">
					{MODEL_VISIBILITY.map((m, i) => {
						const weakest = i === MODEL_VISIBILITY.length - 1;
						return (
							<li
								key={m.name}
								className="grid grid-cols-[1rem_minmax(0,7.5rem)_1fr_2.5rem] items-center gap-3 md:grid-cols-[1rem_10rem_1fr_2.75rem]"
							>
								<span className="size-4 text-zinc-700">{modelIcon(m.name)}</span>
								<span className="truncate text-[13px] text-zinc-700 md:text-sm">{m.name}</span>
								<span className="relative h-2 rounded-full bg-zinc-100">
									<span
										className={`block h-full rounded-full ${weakest ? "bg-amber-500" : "bg-blue-600"}`}
										style={{ width: `${m.value}%` }}
									/>
									{weakest ? (
										<Marker n={2} className="absolute top-1/2 left-[calc(38%+0.75rem)] -translate-y-1/2" />
									) : null}
								</span>
								<span className="text-right font-mono text-[13px] text-zinc-800 tabular-nums">{m.value}%</span>
							</li>
						);
					})}
				</ul>
			</Card>
		</div>
	);
}

/* ------------------------------------------------------------- Share of voice */

const LEADERBOARD = [
	{ name: "Summit Gear", share: 31, delta: -2, tone: "bg-zinc-800" },
	{ name: SAMPLE_BRAND, share: 22, delta: 4, tone: "bg-blue-600", you: true },
	{ name: "Ridgeline", share: 18, delta: 1, tone: "bg-zinc-500" },
	{ name: "Peakform", share: 14, delta: -1, tone: "bg-zinc-400" },
	{ name: "Northfork", share: 9, delta: 0, tone: "bg-zinc-300" },
	{ name: "Kestrel Outdoors", share: 4, delta: -1, tone: "bg-zinc-200" },
];

function BrandMark({ name, you }: { name: string; you?: boolean }) {
	const initials = name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2);
	return (
		<span
			aria-hidden="true"
			className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${you ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200"}`}
		>
			{initials}
		</span>
	);
}

type Brand = (typeof LEADERBOARD)[number];

function LeaderboardRow({ brand: b, rank }: { brand: Brand; rank: number }) {
	return (
		<li
			className={`grid grid-cols-[1.5rem_1fr_3rem] items-center gap-3 px-4 py-2.5 md:grid-cols-[1.5rem_12rem_1fr_3.5rem_6rem] md:px-5 md:py-3 ${b.you ? "bg-blue-50/70" : ""} ${rank > 1 ? "border-t border-zinc-100" : ""} ${rank > 4 ? "max-sm:hidden" : ""}`}
		>
			<span className="font-mono text-xs text-zinc-400 tabular-nums">{rank}</span>
			<span className="flex min-w-0 items-center gap-2.5">
				<BrandMark name={b.name} you={b.you} />
				<span className="truncate text-sm font-medium text-zinc-900">{b.name}</span>
				{rank === 1 ? <Marker n={1} /> : null}
				{b.you ? (
					<span className="rounded bg-blue-600/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-blue-700">
						You
					</span>
				) : null}
			</span>
			<span className="h-2 overflow-hidden rounded-full bg-zinc-100 max-md:hidden">
				<span
					className={`block h-full rounded-full ${b.you ? "bg-blue-600" : "bg-zinc-400"}`}
					style={{ width: `${(b.share / 31) * 100}%` }}
				/>
			</span>
			<span className="text-right font-mono text-sm text-zinc-900 tabular-nums">{b.share}%</span>
			<span className="flex items-center justify-end gap-2 max-md:hidden">
				{b.you ? <Marker n={2} /> : null}
				{b.delta === 0 ? <span className="font-mono text-xs text-zinc-400">0 pts</span> : <Delta value={b.delta} />}
			</span>
		</li>
	);
}

export function ShareOfVoiceView() {
	return (
		<div className="flex h-full flex-col gap-3 md:gap-4">
			<Card className="p-4 md:p-5">
				<div className="flex items-baseline justify-between gap-4">
					<CardLabel>Share of voice · who AI names for your prompts</CardLabel>
					<span className="text-xs text-zinc-400 max-sm:hidden">1,800 answers</span>
				</div>
				<div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
					{LEADERBOARD.map((b) => (
						<span key={b.name} className={b.tone} style={{ width: `${b.share}%` }} />
					))}
					<span className="flex-1 bg-zinc-100" />
				</div>
			</Card>
			<Card className="min-h-0 flex-1 overflow-hidden">
				<div className="grid grid-cols-[1.5rem_1fr_3rem] gap-3 border-b border-zinc-100 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 md:grid-cols-[1.5rem_12rem_1fr_3.5rem_6rem] md:px-5">
					<span>#</span>
					<span>Brand</span>
					<span className="max-md:hidden">Mention share</span>
					<span className="text-right">Share</span>
					<span className="text-right max-md:hidden">30d</span>
				</div>
				<ol>
					{LEADERBOARD.map((b, i) => (
						<LeaderboardRow key={b.name} brand={b} rank={i + 1} />
					))}
				</ol>
			</Card>
		</div>
	);
}

/* ------------------------------------------------------------------ Citations */

const CATEGORIES = [
	{ name: "Editorial & reviews", share: 38, tone: "bg-blue-700" },
	{ name: "Community", share: 24, tone: "bg-blue-500" },
	{ name: "Competitors", share: 17, tone: "bg-blue-300" },
	{ name: "Reference", share: 12, tone: "bg-blue-200" },
	{ name: "Your site", share: 4, tone: "bg-amber-500" },
	{ name: "Other", share: 5, tone: "bg-zinc-200" },
];

const DOMAINS = [
	{ domain: "trailrunnerreview.com", category: "Editorial", count: 412, change: "+38" },
	{ domain: "reddit.com", category: "Community", count: 356, change: "+21" },
	{ domain: "summitgear.com", category: "Competitor", count: 241, change: "+9" },
	{ domain: "youtube.com", category: "Community", count: 188, change: "New" },
	{ domain: "outdoorgearlab.com", category: "Editorial", count: 163, change: "−4" },
	{ domain: "wikipedia.org", category: "Reference", count: 118, change: "+2" },
	{ domain: "acmetrail.com", category: "Your site", count: 71, change: "−12" },
];

export function CitationsView() {
	return (
		<div className="grid h-full gap-3 md:grid-cols-12 md:gap-4">
			<Card className="flex flex-col p-4 max-md:hidden md:col-span-5 md:p-5">
				<CardLabel>Where citations come from</CardLabel>
				<div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
					{CATEGORIES.map((c) => (
						<span key={c.name} className={c.tone} style={{ width: `${c.share}%` }} />
					))}
				</div>
				<ul className="mt-5 space-y-2.5">
					{CATEGORIES.map((c) => (
						<li key={c.name} className="flex items-center gap-2.5 text-sm">
							<span aria-hidden="true" className={`size-2.5 rounded-sm ${c.tone}`} />
							<span className={c.name === "Your site" ? "font-medium text-zinc-950" : "text-zinc-700"}>{c.name}</span>
							{c.name === "Your site" ? <Marker n={1} /> : null}
							<span className="ml-auto font-mono text-[13px] text-zinc-900 tabular-nums">{c.share}%</span>
						</li>
					))}
				</ul>
				<div className="mt-auto rounded-lg bg-zinc-50 p-3 text-[13px] leading-snug text-zinc-600 ring-1 ring-zinc-100">
					<span className="font-medium text-zinc-900">2,184 citations</span> across 28 prompts in the last 30 days.
				</div>
			</Card>
			<Card className="min-h-0 overflow-hidden md:col-span-7">
				<div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 md:px-5">
					<CardLabel>Most-cited domains</CardLabel>
					<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">30d</span>
				</div>
				<ol>
					{DOMAINS.map((d, i) => {
						const own = d.category === "Your site";
						return (
							<li
								key={d.domain}
								className={`flex items-center gap-3 px-4 py-2.5 md:px-5 md:py-3 ${own ? "bg-amber-50/70" : ""} ${i > 0 ? "border-t border-zinc-100" : ""}`}
							>
								<span
									aria-hidden="true"
									className="inline-flex size-6 shrink-0 items-center justify-center rounded bg-zinc-100 font-mono text-[11px] uppercase text-zinc-600 ring-1 ring-zinc-200"
								>
									{d.domain[0]}
								</span>
								<span className="flex min-w-0 flex-1 items-center gap-2">
									<span className="truncate font-mono text-[13px] text-zinc-900">{d.domain}</span>
									{i === 0 ? <Marker n={2} /> : null}
								</span>
								<span
									className={`rounded-full px-2 py-0.5 text-[11px] max-sm:hidden ${own ? "bg-amber-100 text-amber-900" : "bg-zinc-100 text-zinc-600"}`}
								>
									{d.category}
								</span>
								<span className="w-10 text-right font-mono text-[13px] text-zinc-900 tabular-nums">{d.count}</span>
								<span
									className={`w-9 text-right font-mono text-[11px] tabular-nums ${d.change === "New" ? "text-blue-700" : d.change.startsWith("−") ? "text-rose-700" : "text-emerald-700"}`}
								>
									{d.change}
								</span>
							</li>
						);
					})}
				</ol>
			</Card>
		</div>
	);
}

/* -------------------------------------------------------------- Opportunities */

const OPPORTUNITIES = [
	{
		impact: "High",
		kind: "Outreach",
		icon: Megaphone,
		title: "Get into trailrunnerreview.com's “best trail shoes” roundup",
		why: "Cited in 41% of answers that name Summit Gear but not you.",
		prompts: 9,
		sources: 14,
	},
	{
		impact: "High",
		kind: "Create",
		icon: FileText,
		title: "Publish a wide-toe-box trail shoe comparison",
		why: "You're absent from all 5 buying prompts on this topic.",
		prompts: 5,
		sources: 8,
	},
	{
		impact: "Medium",
		kind: "Refresh",
		icon: RefreshCw,
		title: "Update your waterproofing guide",
		why: "Citations of acmetrail.com fell 12 this month on Perplexity.",
		prompts: 4,
		sources: 6,
	},
	{
		impact: "Medium",
		kind: "Community",
		icon: MessagesSquare,
		title: "Answer the r/trailrunning sizing threads AI keeps citing",
		why: "Three threads appear in ChatGPT answers every week.",
		prompts: 3,
		sources: 3,
	},
];

export function OpportunitiesView() {
	return (
		<div className="flex h-full flex-col gap-2.5 md:gap-3">
			<div className="flex items-baseline justify-between px-1 max-sm:hidden">
				<CardLabel>4 recommendations from 1,800 AI answers</CardLabel>
				<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">Sorted by impact</span>
			</div>
			{OPPORTUNITIES.map((o, i) => {
				const Icon = o.icon;
				const high = o.impact === "High";
				return (
					<Card
						key={o.title}
						className={`flex items-start gap-3 p-3.5 md:gap-4 md:p-4 ${i > 1 ? "max-sm:hidden" : ""}`}
					>
						<span
							aria-hidden="true"
							className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200"
						>
							<Icon className="size-4" />
						</span>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
								<span
									className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${high ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700"}`}
								>
									{o.impact} impact
								</span>
								<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">{o.kind}</span>
								{i === 0 ? <Marker n={1} /> : null}
							</div>
							<p className="mt-1.5 text-sm font-medium leading-snug text-zinc-950 md:text-[15px]">{o.title}</p>
							<p className="mt-0.5 text-[13px] leading-snug text-zinc-500">{o.why}</p>
						</div>
						<span className="flex shrink-0 items-center gap-2 max-md:hidden">
							{i === 0 ? <Marker n={2} /> : null}
							<span className="rounded-md bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-600 ring-1 ring-zinc-200">
								{o.prompts} prompts
							</span>
							<span className="rounded-md bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-600 ring-1 ring-zinc-200 max-lg:hidden">
								{o.sources} sources
							</span>
						</span>
					</Card>
				);
			})}
		</div>
	);
}
