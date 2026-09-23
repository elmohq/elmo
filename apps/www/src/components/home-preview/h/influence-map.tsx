import { ArrowDown, Check, Lightbulb } from "lucide-react";
import { useState } from "react";
import { MODELS } from "./models";

// Every value on this map is illustrative. Quillbeam, Paysprout, Tallyfox and
// Invoxa are made-up invoicing apps, and the review and news domains are
// fictional, so nobody reads the map as a real brand's results.

const YOU = "quillbeam";

const ENGINES = [
	{ id: "chatgpt", name: "ChatGPT", model: "ChatGPT" },
	{ id: "claude", name: "Claude", model: "Claude" },
	{ id: "gemini", name: "Gemini", model: "Gemini" },
	{ id: "perplexity", name: "Perplexity", model: "Perplexity" },
	{ id: "aio", name: "AI Overviews", model: "Google AI Overviews" },
] as const;

const BRANDS = [
	{ id: "quillbeam", name: "Quillbeam", share: 21 },
	{ id: "paysprout", name: "Paysprout", share: 38 },
	{ id: "tallyfox", name: "Tallyfox", share: 24 },
	{ id: "invoxa", name: "Invoxa", share: 17 },
] as const;

type EngineId = (typeof ENGINES)[number]["id"];
type BrandId = (typeof BRANDS)[number]["id"];

interface Source {
	id: string;
	domain: string;
	kind: string;
	mentions: Partial<Record<BrandId, number>>;
}

// Ordered by how often the engines cite them.
const SOURCES: Source[] = [
	{
		id: "reviews",
		domain: "bestinvoiceapps.com",
		kind: "Review site",
		mentions: { paysprout: 3, tallyfox: 2, invoxa: 1 },
	},
	{ id: "forum", domain: "reddit.com", kind: "Forum", mentions: { quillbeam: 2, paysprout: 2, tallyfox: 1 } },
	{ id: "news", domain: "freelanceweekly.news", kind: "News", mentions: { paysprout: 2, invoxa: 1 } },
	{ id: "video", domain: "youtube.com", kind: "Video", mentions: { tallyfox: 2, quillbeam: 1 } },
	{ id: "docs", domain: "help.quillbeam.com", kind: "Your docs", mentions: { quillbeam: 3 } },
];

// How often each engine cites each source (1 = occasionally, 4 = constantly).
const CITES: Record<EngineId, Record<string, number>> = {
	chatgpt: { reviews: 4, forum: 3, news: 2 },
	claude: { docs: 3, reviews: 2, forum: 1 },
	gemini: { reviews: 3, video: 2, news: 2 },
	perplexity: { forum: 4, reviews: 2, news: 1, docs: 1 },
	aio: { reviews: 3, video: 3, forum: 1 },
};

const isGap = (s: Source) => !s.mentions[YOU];
const GAPS = SOURCES.filter(isGap);
const GAP_ENGINES = new Set(GAPS.flatMap((s) => enginesCiting(s.id).map((e) => e.id))).size;
const TOTAL_CITES = SOURCES.reduce((n, s) => n + sourceCites(s.id), 0);

function sourceCites(sourceId: string) {
	return ENGINES.reduce((n, e) => n + (CITES[e.id][sourceId] ?? 0), 0);
}

function enginesCiting(sourceId: string) {
	return ENGINES.filter((e) => CITES[e.id][sourceId]);
}

function iconFor(model: string) {
	return MODELS.find((m) => m.name === model)?.icon ?? MODELS[0].icon;
}

function listNames(names: string[]) {
	if (names.length < 2) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Desktop geometry, in viewBox units. The HTML nodes are positioned with the
// same numbers as percentages, so the SVG edges land on their edges exactly.

const VB_W = 1000;
const VB_H = 470;
const ENGINE_RIGHT = 200;
const SOURCE_LEFT = 368;
const SOURCE_RIGHT = 632;
const BRAND_LEFT = 800;
const sourceY = (i: number) => 52 + i * 91;
const brandY = (i: number) => 52 + i * 70;

type Kind = "engine" | "source" | "brand";
type Active = { kind: Kind; id: string } | null;

interface Edge {
	key: string;
	from: string;
	to: string;
	d: string;
	weight: number;
	stage: "cite" | "mention" | "gap";
}

function curve(x1: number, y1: number, x2: number, y2: number) {
	const dx = (x2 - x1) * 0.5;
	return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const EDGES: Edge[] = [
	...ENGINES.flatMap((e, ei) =>
		SOURCES.flatMap((s, si) => {
			const w = CITES[e.id][s.id];
			if (!w) return [];
			return [
				{
					key: `${e.id}>${s.id}`,
					from: e.id,
					to: s.id,
					d: curve(ENGINE_RIGHT, sourceY(ei), SOURCE_LEFT, sourceY(si)),
					weight: w,
					stage: "cite" as const,
				},
			];
		}),
	),
	...SOURCES.flatMap((s, si) =>
		BRANDS.flatMap((b, bi) => {
			const w = s.mentions[b.id];
			const gap = !w && b.id === YOU && isGap(s);
			if (!w && !gap) return [];
			return [
				{
					key: `${s.id}>${b.id}`,
					from: s.id,
					to: b.id,
					d: curve(SOURCE_RIGHT, sourceY(si), BRAND_LEFT, brandY(bi)),
					weight: w ?? 1,
					stage: gap ? ("gap" as const) : ("mention" as const),
				},
			];
		}),
	),
];

function traced(active: Active) {
	if (!active) return null;
	const edges = new Set<string>();
	const add = (pred: (e: Edge) => boolean) => {
		for (const e of EDGES) if (pred(e)) edges.add(e.key);
	};
	if (active.kind === "source") {
		add((e) => e.from === active.id || e.to === active.id);
	} else if (active.kind === "engine") {
		const reached = new Set(Object.keys(CITES[active.id as EngineId]));
		add((e) => e.from === active.id || (e.stage !== "cite" && reached.has(e.from)));
	} else {
		const feeding = new Set(EDGES.filter((e) => e.to === active.id).map((e) => e.from));
		add((e) => e.to === active.id || (e.stage === "cite" && feeding.has(e.to)));
	}
	const nodes = new Set<string>([active.id]);
	for (const e of EDGES) {
		if (edges.has(e.key)) {
			nodes.add(e.from);
			nodes.add(e.to);
		}
	}
	return { edges, nodes };
}

function describe(active: Active) {
	if (!active) {
		return "Hover or focus any engine, source, or brand to trace its paths.";
	}
	if (active.kind === "engine") {
		const engine = ENGINES.find((e) => e.id === active.id);
		const cited = SOURCES.filter((s) => CITES[active.id as EngineId][s.id]);
		const gaps = cited.filter(isGap);
		return `${engine?.name} cites ${cited.length} of these sources${
			gaps.length ? `. ${gaps.length} of them never mention Quillbeam.` : ", and Quillbeam appears in every one."
		}`;
	}
	if (active.kind === "source") {
		const source = SOURCES.find((s) => s.id === active.id);
		if (!source) return "";
		const named = BRANDS.filter((b) => source.mentions[b.id]).map((b) => b.name);
		return `${source.domain} is cited by ${enginesCiting(source.id).length} of 5 engines and names ${listNames(named)}${
			isGap(source) ? ", but not Quillbeam." : "."
		}`;
	}
	const brand = BRANDS.find((b) => b.id === active.id);
	const sources = SOURCES.filter((s) => s.mentions[active.id as BrandId]);
	const engines = ENGINES.filter((e) => sources.some((s) => CITES[e.id][s.id]));
	return `${brand?.name} is named by ${sources.length} of the top 5 sources, which feed ${engines.length} of 5 engines.`;
}

function edgeStyle(edge: Edge, state: "idle" | "on" | "off") {
	if (edge.stage === "gap") {
		return { stroke: "#f59e0b", width: 2, opacity: state === "off" ? 0.12 : 1 };
	}
	const width = 0.75 + edge.weight * 1.25;
	const yours = edge.to === YOU;
	if (state === "off") return { stroke: "#a1a1aa", width, opacity: 0.1 };
	if (state === "on") {
		return { stroke: yours || edge.stage === "cite" ? "#2563eb" : "#52525b", width, opacity: 0.75 };
	}
	if (yours) return { stroke: "#2563eb", width, opacity: 0.55 };
	return { stroke: edge.stage === "cite" ? "#93a4c3" : "#a1a1aa", width, opacity: 0.38 };
}

const mapCss = `
@media (prefers-reduced-motion: no-preference) {
	.h-gap-flow { animation: h-gap-flow 1.2s linear infinite; }
	.h-ping { animation: h-ping 2.4s ease-out infinite; }
}
@keyframes h-gap-flow { to { stroke-dashoffset: -14; } }
@keyframes h-ping { 0% { transform: scale(1); opacity: .55; } 70%, 100% { transform: scale(2.4); opacity: 0; } }
`;

const nodeFocus =
	"outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

function GapTag() {
	return (
		<span className="inline-flex h-[18px] items-center rounded-full bg-amber-100 px-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-amber-800">
			Gap
		</span>
	);
}

function OpportunityCallout({ className = "" }: { className?: string }) {
	return (
		<div
			className={`rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgb(245_158_11/0.35),0_12px_32px_-8px_rgb(245_158_11/0.35)] ${className}`}
		>
			<p className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700">
				<Lightbulb className="size-3.5" aria-hidden="true" />
				Opportunity
			</p>
			<p className="mt-2 text-[15px] font-semibold leading-snug text-zinc-950">
				{GAPS.length} of the {SOURCES.length} most-cited sources don't mention you.
			</p>
			<p className="mt-1.5 text-[13px]/5 text-zinc-600">
				{listNames(GAPS.map((s) => s.domain))} are cited by {GAP_ENGINES === ENGINES.length ? "all" : GAP_ENGINES}{" "}
				{ENGINES.length} engines, and only name your competitors.
			</p>
		</div>
	);
}

function Legend() {
	return (
		<div
			aria-hidden="true"
			className="hidden items-center gap-5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 md:flex"
		>
			<span className="flex items-center gap-2">
				<svg aria-hidden="true" width="28" height="10" viewBox="0 0 28 10" className="text-zinc-400">
					<line x1="0" y1="2" x2="28" y2="2" stroke="currentColor" strokeWidth="1" />
					<line x1="0" y1="8" x2="28" y2="8" stroke="currentColor" strokeWidth="3.5" />
				</svg>
				Citation frequency
			</span>
			<span className="flex items-center gap-2">
				<svg aria-hidden="true" width="28" height="4" viewBox="0 0 28 4">
					<line x1="0" y1="2" x2="28" y2="2" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
				</svg>
				Not mentioned
			</span>
		</div>
	);
}

function MapHeader() {
	return (
		<div className="flex items-center justify-between gap-4 border-b border-zinc-200/80 px-4 py-3 md:px-5">
			<p className="flex min-w-0 items-center gap-2.5 text-[13px] text-zinc-600">
				<span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-amber-800 ring-1 ring-amber-200">
					Example
				</span>
				<span className="truncate">
					<span className="font-medium text-zinc-900">Quillbeam</span>
					<span className="hidden sm:inline"> · fictional invoicing app, illustrative data</span>
					<span className="sm:hidden"> · illustrative</span>
				</span>
			</p>
			<Legend />
		</div>
	);
}

function DesktopMap() {
	const [active, setActive] = useState<Active>(null);
	const trace = traced(active);
	const dim = (id: string) => (trace && !trace.nodes.has(id) ? "opacity-35" : "opacity-100");
	const bind = (kind: Kind, id: string) => ({
		onMouseEnter: () => setActive({ kind, id }),
		onFocus: () => setActive({ kind, id }),
		onMouseLeave: () => setActive(null),
		onBlur: () => setActive(null),
	});
	const pct = (v: number, of: number) => `${(v / of) * 100}%`;

	return (
		<div className="hidden lg:block">
			<div className="grid grid-cols-[20%_1fr_20%] px-8 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
				<span className="text-right">
					<span className="text-blue-600">01</span> AI engines
				</span>
				<span className="text-center">
					<span className="text-blue-600">02</span> Sources they cite
				</span>
				<span>
					<span className="text-blue-600">03</span> Brands they name
				</span>
			</div>

			<div className="px-8 pb-6 pt-3">
				<div className="relative w-full" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
					<svg
						aria-hidden="true"
						viewBox={`0 0 ${VB_W} ${VB_H}`}
						preserveAspectRatio="none"
						className="absolute inset-0 size-full overflow-visible"
					>
						{EDGES.map((edge) => {
							const state = !trace ? "idle" : trace.edges.has(edge.key) ? "on" : "off";
							const s = edgeStyle(edge, state);
							return (
								<path
									key={edge.key}
									d={edge.d}
									fill="none"
									stroke={s.stroke}
									strokeWidth={s.width}
									strokeOpacity={s.opacity}
									strokeLinecap="round"
									strokeDasharray={edge.stage === "gap" ? "5 4" : undefined}
									vectorEffect="non-scaling-stroke"
									className={`transition-[stroke-opacity,stroke] duration-200 ${edge.stage === "gap" ? "h-gap-flow" : ""}`}
								/>
							);
						})}
					</svg>

					<ul aria-label="AI engines">
						{ENGINES.map((e, i) => {
							const Icon = iconFor(e.model);
							return (
								<li
									key={e.id}
									className="absolute -translate-y-1/2"
									style={{ right: pct(VB_W - ENGINE_RIGHT, VB_W), top: pct(sourceY(i), VB_H) }}
								>
									<button
										type="button"
										{...bind("engine", e.id)}
										className={`flex h-10 items-center gap-2.5 rounded-full bg-white pl-1.5 pr-4 shadow-[0_0_0_1px_rgb(24_24_27/0.1),0_2px_6px_-2px_rgb(24_24_27/0.12)] ${nodeFocus} ${dim(e.id)}`}
									>
										<span className="flex size-7 items-center justify-center rounded-full bg-zinc-950 p-1.5 text-white">
											<Icon />
										</span>
										<span className="whitespace-nowrap text-[13px] font-medium text-zinc-900">{e.name}</span>
									</button>
								</li>
							);
						})}
					</ul>

					<ul aria-label="Most-cited sources">
						{SOURCES.map((s, i) => {
							const gap = isGap(s);
							const share = Math.round((sourceCites(s.id) / TOTAL_CITES) * 100);
							return (
								<li
									key={s.id}
									className="absolute -translate-y-1/2"
									style={{
										left: pct(SOURCE_LEFT, VB_W),
										width: pct(SOURCE_RIGHT - SOURCE_LEFT, VB_W),
										top: pct(sourceY(i), VB_H),
									}}
								>
									<button
										type="button"
										{...bind("source", s.id)}
										className={`relative flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left ${
											gap
												? "shadow-[0_0_0_1.5px_rgb(245_158_11/0.7),0_6px_18px_-6px_rgb(245_158_11/0.45)]"
												: "shadow-[0_0_0_1px_rgb(24_24_27/0.1),0_2px_6px_-2px_rgb(24_24_27/0.12)]"
										} ${nodeFocus} ${dim(s.id)}`}
									>
										<span className="font-mono text-[11px] text-zinc-400">#{i + 1}</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-mono text-[12.5px] text-zinc-900">{s.domain}</span>
											<span className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
												{s.kind}
												<span aria-hidden="true" className="h-1 w-12 overflow-hidden rounded-full bg-zinc-100">
													<span
														className={`block h-full rounded-full ${gap ? "bg-amber-400" : "bg-blue-500"}`}
														style={{ width: `${Math.min(100, share * 2.4)}%` }}
													/>
												</span>
												<span className="font-mono text-[10.5px] text-zinc-400">{share}%</span>
											</span>
										</span>
										{gap ? (
											<GapTag />
										) : (
											<span className="flex size-[18px] items-center justify-center rounded-full bg-blue-50 text-blue-600">
												<Check className="size-3" aria-hidden="true" />
												<span className="sr-only">Mentions Quillbeam</span>
											</span>
										)}
									</button>
								</li>
							);
						})}
					</ul>

					<ul aria-label="Brands">
						{BRANDS.map((b, i) => {
							const you = b.id === YOU;
							return (
								<li
									key={b.id}
									className="absolute -translate-y-1/2"
									style={{ left: pct(BRAND_LEFT, VB_W), right: 0, top: pct(brandY(i), VB_H) }}
								>
									<button
										type="button"
										{...bind("brand", b.id)}
										className={`relative w-full rounded-xl px-3 py-2 text-left ${
											you
												? "bg-blue-600 text-white shadow-[0_8px_24px_-8px_rgb(37_99_235/0.6)]"
												: "bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(24_24_27/0.1),0_2px_6px_-2px_rgb(24_24_27/0.12)]"
										} ${nodeFocus} ${dim(b.id)}`}
									>
										{you ? (
											<span aria-hidden="true" className="absolute -left-1 top-1/2 size-2 -translate-y-1/2">
												<span className="h-ping absolute inset-0 rounded-full bg-amber-400" />
												<span className="absolute inset-0 rounded-full bg-amber-400 ring-2 ring-white" />
											</span>
										) : null}
										<span className="flex items-center justify-between gap-2">
											<span className="text-[13px] font-semibold">
												{b.name}
												{you ? (
													<span className="ml-1.5 rounded bg-white/20 px-1 py-px font-mono text-[9.5px] font-medium uppercase tracking-wider">
														You
													</span>
												) : null}
											</span>
											<span className={`font-mono text-[11px] ${you ? "text-blue-100" : "text-zinc-500"}`}>
												{b.share}%
											</span>
										</span>
										<span
											aria-hidden="true"
											className={`mt-1.5 block h-1 overflow-hidden rounded-full ${you ? "bg-white/25" : "bg-zinc-100"}`}
										>
											<span
												className={`block h-full rounded-full ${you ? "bg-white" : "bg-zinc-400"}`}
												style={{ width: `${b.share * 2}%` }}
											/>
										</span>
										<span className="sr-only">share of voice</span>
									</button>
								</li>
							);
						})}
					</ul>

					<div className="absolute right-0 bottom-0" style={{ left: pct(BRAND_LEFT - 30, VB_W) }}>
						<OpportunityCallout />
					</div>
				</div>
			</div>

			<p
				aria-live="polite"
				className="flex min-h-11 items-center gap-2 border-t border-zinc-200/80 bg-zinc-50/70 px-5 text-[13px] text-zinc-600"
			>
				<span aria-hidden="true" className={`size-1.5 rounded-full ${active ? "bg-blue-600" : "bg-zinc-300"}`} />
				{describe(active)}
			</p>
		</div>
	);
}

function MobileStage({ n, title }: { n: string; title: string }) {
	return (
		<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
			<span className="text-blue-600">{n}</span> {title}
		</p>
	);
}

function MobileArrow({ label }: { label: string }) {
	return (
		<div
			aria-hidden="true"
			className="flex items-center gap-2 py-3 pl-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400"
		>
			<span className="flex size-5 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
				<ArrowDown className="size-3" />
			</span>
			{label}
		</div>
	);
}

function MobileMap() {
	return (
		<div className="p-4 lg:hidden">
			<MobileStage n="01" title="AI engines" />
			<ul className="mt-2.5 flex flex-wrap gap-1.5">
				{ENGINES.map((e) => {
					const Icon = iconFor(e.model);
					return (
						<li
							key={e.id}
							className="flex h-8 items-center gap-1.5 rounded-full bg-white pl-1 pr-3 shadow-[0_0_0_1px_rgb(24_24_27/0.1)]"
						>
							<span className="flex size-6 items-center justify-center rounded-full bg-zinc-950 p-[5px] text-white">
								<Icon />
							</span>
							<span className="text-[12px] font-medium text-zinc-900">{e.name}</span>
						</li>
					);
				})}
			</ul>

			<MobileArrow label="cite" />

			<MobileStage n="02" title="Sources they cite most" />
			<ul className="mt-2.5 space-y-1.5">
				{SOURCES.map((s, i) => {
					const gap = isGap(s);
					const share = Math.round((sourceCites(s.id) / TOTAL_CITES) * 100);
					return (
						<li
							key={s.id}
							className={`flex items-center gap-2.5 rounded-lg bg-white px-3 py-2 ${
								gap ? "shadow-[0_0_0_1.5px_rgb(245_158_11/0.7)]" : "shadow-[0_0_0_1px_rgb(24_24_27/0.1)]"
							}`}
						>
							<span className="font-mono text-[11px] text-zinc-400">#{i + 1}</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-mono text-[12px] text-zinc-900">{s.domain}</span>
								<span className="text-[11px] text-zinc-500">
									{s.kind} · {share}% of citations
								</span>
							</span>
							{gap ? (
								<GapTag />
							) : (
								<span className="flex size-[18px] items-center justify-center rounded-full bg-blue-50 text-blue-600">
									<Check className="size-3" aria-hidden="true" />
									<span className="sr-only">Mentions Quillbeam</span>
								</span>
							)}
						</li>
					);
				})}
			</ul>

			<MobileArrow label="name" />

			<MobileStage n="03" title="Brands they name" />
			<ul className="mt-2.5 grid grid-cols-2 gap-1.5">
				{BRANDS.map((b) => {
					const you = b.id === YOU;
					return (
						<li
							key={b.id}
							className={`rounded-lg px-3 py-2 ${you ? "bg-blue-600 text-white" : "bg-white text-zinc-900 shadow-[0_0_0_1px_rgb(24_24_27/0.1)]"}`}
						>
							<span className="flex items-center justify-between text-[12.5px] font-semibold">
								{b.name}
								<span className={`font-mono text-[11px] font-normal ${you ? "text-blue-100" : "text-zinc-500"}`}>
									{b.share}%<span className="sr-only"> share of voice</span>
								</span>
							</span>
							<span
								aria-hidden="true"
								className={`mt-1.5 block h-1 overflow-hidden rounded-full ${you ? "bg-white/25" : "bg-zinc-100"}`}
							>
								<span
									className={`block h-full rounded-full ${you ? "bg-white" : "bg-zinc-400"}`}
									style={{ width: `${b.share * 2}%` }}
								/>
							</span>
						</li>
					);
				})}
			</ul>

			<OpportunityCallout className="mt-4" />
		</div>
	);
}

export function InfluenceMap() {
	return (
		<figure className="relative overflow-hidden rounded-2xl bg-white/90 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_32px_64px_-24px_rgb(37_99_235/0.28)] backdrop-blur">
			<style>{mapCss}</style>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:radial-gradient(rgb(24_24_27/0.07)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]"
			/>
			<figcaption className="sr-only">
				Example influence map for Quillbeam, a fictional invoicing app. Five AI engines cite five main sources. Two of
				them, bestinvoiceapps.com and freelanceweekly.news, name competitors Paysprout, Tallyfox and Invoxa but never
				Quillbeam.
			</figcaption>
			<div className="relative">
				<MapHeader />
				<DesktopMap />
				<MobileMap />
			</div>
		</figure>
	);
}
