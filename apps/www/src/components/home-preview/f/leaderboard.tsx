import { ArrowDown, ArrowUp, Link2, Minus, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MODELS } from "./models";

// Every number here is illustrative. The brands are made up so nobody reads the
// race as a real customer's results.

type BrandId = "tallybook" | "sumwise" | "fernbook" | "quillpay" | "paperkite";

const BRANDS: { id: BrandId; name: string; mark: string; you?: boolean }[] = [
	{ id: "tallybook", name: "Tallybook", mark: "bg-amber-400/15 text-amber-300" },
	{ id: "sumwise", name: "Sumwise", mark: "bg-emerald-400/15 text-emerald-300" },
	{ id: "fernbook", name: "Fernbook", mark: "bg-blue-500 text-white", you: true },
	{ id: "quillpay", name: "Quillpay", mark: "bg-violet-400/15 text-violet-300" },
	{ id: "paperkite", name: "Paperkite", mark: "bg-rose-400/15 text-rose-300" },
];

type EngineId = "all" | "chatgpt" | "perplexity" | "gemini" | "aio";

const ENGINES: { id: EngineId; label: string; model?: string }[] = [
	{ id: "all", label: "All engines" },
	{ id: "chatgpt", label: "ChatGPT", model: "ChatGPT" },
	{ id: "perplexity", label: "Perplexity", model: "Perplexity" },
	{ id: "gemini", label: "Gemini", model: "Gemini" },
	{ id: "aio", label: "AI Overviews", model: "Google AI Overviews" },
];

/** Share of voice (%) on day 1 and day 30. "All engines" is the average of the four. */
const SERIES: Record<EngineId, Record<BrandId, [number, number]>> = {
	all: { tallybook: [31, 29], sumwise: [24, 21], fernbook: [12, 23], quillpay: [18, 15], paperkite: [9, 8] },
	chatgpt: { tallybook: [34, 30], sumwise: [22, 20], fernbook: [14, 26], quillpay: [17, 14], paperkite: [8, 7] },
	perplexity: { tallybook: [27, 25], sumwise: [25, 20], fernbook: [15, 28], quillpay: [16, 13], paperkite: [11, 9] },
	gemini: { tallybook: [33, 31], sumwise: [23, 22], fernbook: [10, 19], quillpay: [20, 18], paperkite: [9, 8] },
	aio: { tallybook: [30, 30], sumwise: [26, 22], fernbook: [9, 20], quillpay: [19, 16], paperkite: [10, 9] },
};

const FIRST_DAY = 1;
const LAST_DAY = 30;
const EVENT_DAY = 12;
const BAR_MAX = 34;
const PLAY_MS = 3400;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const smooth = (t: number) => t * t * (3 - 2 * t);

// Competitors drift linearly with a little wobble; the highlighted brand is flat
// until the citations land on EVENT_DAY, then climbs.
function shareOn(engine: EngineId, brand: BrandId, day: number) {
	const [start, end] = SERIES[engine][brand];
	const t = (day - FIRST_DAY) / (LAST_DAY - FIRST_DAY);
	if (brand === "fernbook") {
		const climb = smooth(clamp((day - EVENT_DAY + 1) / 14, 0, 1));
		return start + (end - start) * climb + 0.6 * Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI);
	}
	const phase = brand.length;
	return start + (end - start) * t + 1.3 * Math.sin(t * Math.PI * 4 + phase) * Math.sin(t * Math.PI);
}

function standings(engine: EngineId, day: number) {
	const rows = BRANDS.map((b) => ({ ...b, share: shareOn(engine, b.id, day) }));
	const ranked = [...rows].sort((a, b) => b.share - a.share);
	return rows.map((r) => ({ ...r, rank: ranked.findIndex((x) => x.id === r.id) + 1 }));
}

function rankOf(engine: EngineId, brand: BrandId, day: number) {
	return standings(engine, day).find((r) => r.id === brand)?.rank ?? 0;
}

function EngineIcon({ model }: { model?: string }) {
	const Icon = MODELS.find((m) => m.name === model)?.icon;
	if (!Icon) {
		return (
			<span aria-hidden="true" className="grid size-3.5 grid-cols-2 gap-px">
				<span className="rounded-[1px] bg-current" />
				<span className="rounded-[1px] bg-current opacity-60" />
				<span className="rounded-[1px] bg-current opacity-60" />
				<span className="rounded-[1px] bg-current" />
			</span>
		);
	}
	return (
		<span aria-hidden="true" className="size-3.5">
			<Icon />
		</span>
	);
}

function RankDelta({ from, to }: { from: number; to: number }) {
	const diff = from - to;
	if (diff === 0) {
		return (
			<span className="inline-flex items-center text-zinc-500">
				<Minus className="size-3" aria-hidden="true" />
				<span className="sr-only">No change</span>
			</span>
		);
	}
	const up = diff > 0;
	const Icon = up ? ArrowUp : ArrowDown;
	return (
		<span className={`inline-flex items-center gap-0.5 tabular-nums ${up ? "text-emerald-400" : "text-rose-400/90"}`}>
			<Icon className="size-3" aria-hidden="true" />
			<span className="sr-only">{up ? "Up" : "Down"}</span>
			{Math.abs(diff)}
		</span>
	);
}

export function ShareOfVoiceRace() {
	const [engine, setEngine] = useState<EngineId>("all");
	const [day, setDay] = useState(LAST_DAY);
	const [playing, setPlaying] = useState(false);
	const frame = useRef<number | null>(null);

	const stop = useCallback(() => {
		if (frame.current !== null) cancelAnimationFrame(frame.current);
		frame.current = null;
		setPlaying(false);
	}, []);

	const play = useCallback(() => {
		if (frame.current !== null) cancelAnimationFrame(frame.current);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setDay(LAST_DAY);
			return;
		}
		setPlaying(true);
		setDay(FIRST_DAY);
		let start: number | null = null;
		const tick = (now: number) => {
			start ??= now;
			const t = clamp((now - start) / PLAY_MS, 0, 1);
			setDay(FIRST_DAY + (LAST_DAY - FIRST_DAY) * t);
			if (t < 1) {
				frame.current = requestAnimationFrame(tick);
			} else {
				frame.current = null;
				setPlaying(false);
			}
		};
		frame.current = requestAnimationFrame(tick);
	}, []);

	// The server renders the finished race so the static page reads on its own;
	// motion replays it once on load.
	useEffect(() => {
		const id = window.setTimeout(play, 500);
		return () => {
			window.clearTimeout(id);
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [play]);

	const selectEngine = (id: EngineId) => {
		setEngine(id);
		play();
	};

	const rows = standings(engine, day);
	const shownDay = Math.round(day);
	const youStart = rankOf(engine, "fernbook", FIRST_DAY);
	const youNow = rows.find((r) => r.you)?.rank ?? 0;
	const progress = (day - FIRST_DAY) / (LAST_DAY - FIRST_DAY);
	const eventAt = (EVENT_DAY - FIRST_DAY) / (LAST_DAY - FIRST_DAY);
	const eventReached = day >= EVENT_DAY;
	const finished = !playing && shownDay === LAST_DAY;

	return (
		<figure className="relative rounded-2xl bg-zinc-900/70 p-1 shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_30px_80px_-20px_rgb(37_99_235/0.45)] backdrop-blur">
			<figcaption className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 pb-2.5 pt-2 sm:px-4">
				<span className="rounded-full bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300 ring-1 ring-amber-400/25">
					Example
				</span>
				<span className="text-[13px] text-zinc-300">
					Share of voice · <span className="text-zinc-100">invoicing apps for freelancers</span>
				</span>
				<span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 2xl:inline">
					Sample brands · illustrative data
				</span>
			</figcaption>

			<div className="rounded-xl bg-zinc-950/80 ring-1 ring-white/[0.06]">
				<div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
					<fieldset className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
						<legend className="sr-only">AI engine</legend>
						{ENGINES.map((e) => {
							const active = e.id === engine;
							return (
								<button
									key={e.id}
									type="button"
									aria-pressed={active}
									onClick={() => selectEngine(e.id)}
									className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 ${
										active
											? "bg-white/10 text-white ring-1 ring-white/15"
											: "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
									}`}
								>
									<EngineIcon model={e.model} />
									{e.label}
								</button>
							);
						})}
					</fieldset>
				</div>

				<div className="px-2 pt-2 sm:px-3">
					<div
						aria-hidden="true"
						className="grid grid-cols-[1.25rem_minmax(0,6rem)_1fr_2.75rem] items-center gap-x-2.5 px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 sm:grid-cols-[1.5rem_9.5rem_1fr_3rem_2.5rem] sm:gap-x-3"
					>
						<span>#</span>
						<span>Brand</span>
						<span>
							<span className="sm:hidden">Mentions</span>
							<span className="max-sm:hidden">Mentioned in answers</span>
						</span>
						<span className="text-right">SoV</span>
						<span className="hidden text-right sm:block">Δ</span>
					</div>

					<ol className="sr-only">
						{[...rows]
							.sort((a, b) => a.rank - b.rank)
							.map((r) => (
								<li key={r.id}>
									{r.name}
									{r.you ? " (your brand)" : ""}: rank {r.rank}, {Math.round(r.share)}% share of voice
								</li>
							))}
					</ol>

					<div aria-hidden="true" className="relative h-[calc(5*var(--row))] [--row:2.75rem] sm:[--row:3.25rem]">
						{rows.map((r) => {
							const firstRank = rankOf(engine, r.id, FIRST_DAY);
							return (
								<div
									key={r.id}
									className="absolute inset-x-0 top-0 h-[var(--row)] py-1 transition-transform duration-500 ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none"
									style={{ transform: `translateY(calc(${r.rank - 1} * var(--row)))`, zIndex: r.you ? 2 : 1 }}
								>
									<div
										className={`grid h-full grid-cols-[1.25rem_minmax(0,6rem)_1fr_2.75rem] items-center gap-x-2.5 rounded-lg px-2 sm:grid-cols-[1.5rem_9.5rem_1fr_3rem_2.5rem] sm:gap-x-3 ${
											r.you ? "bg-blue-500/[0.09] ring-1 ring-blue-400/30" : ""
										}`}
									>
										<span className={`font-mono text-xs tabular-nums ${r.you ? "text-blue-300" : "text-zinc-500"}`}>
											{r.rank}
										</span>
										<span className="flex min-w-0 items-center gap-2">
											<span
												className={`hidden size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold sm:flex ${r.mark}`}
											>
												{r.name[0]}
											</span>
											<span
												className={`truncate text-[13px] sm:text-sm ${r.you ? "font-semibold text-white" : "text-zinc-300"}`}
											>
												{r.name}
											</span>
											{r.you ? (
												<span className="hidden shrink-0 rounded bg-blue-500/20 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.12em] text-blue-200 ring-1 ring-blue-400/30 sm:inline">
													You
												</span>
											) : null}
										</span>
										<span className="relative h-2 overflow-hidden rounded-full bg-white/[0.05] sm:h-2.5">
											<span
												className={`absolute inset-y-0 left-0 rounded-full ${
													r.you
														? "bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_16px_rgb(59_130_246/0.7)]"
														: "bg-zinc-600"
												}`}
												style={{ width: `${clamp((r.share / BAR_MAX) * 100, 2, 100)}%` }}
											/>
										</span>
										<span
											className={`text-right font-mono text-xs tabular-nums sm:text-[13px] ${r.you ? "text-white" : "text-zinc-400"}`}
										>
											{Math.round(r.share)}%
										</span>
										<span className="hidden justify-end font-mono text-[11px] sm:flex">
											<RankDelta from={firstRank} to={r.rank} />
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="mt-2 border-t border-white/[0.06] px-3 pb-3.5 pt-3 sm:px-4 sm:pb-4">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => (playing ? stop() : play())}
							aria-label={playing ? "Pause the 30-day replay" : "Replay the 30 days"}
							className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-zinc-200 ring-1 ring-white/10 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
						>
							{playing ? (
								<Pause className="size-3 fill-current" aria-hidden="true" />
							) : finished ? (
								<RotateCcw className="size-3.5" aria-hidden="true" />
							) : (
								<Play className="ml-px size-3 fill-current" aria-hidden="true" />
							)}
						</button>
						<span className="w-11 shrink-0 font-mono text-[11px] text-zinc-500">Day 1</span>
						<div className="relative h-7 flex-1">
							<input
								type="range"
								min={FIRST_DAY}
								max={LAST_DAY}
								step={1}
								value={shownDay}
								aria-label="Timeline day"
								aria-valuetext={`Day ${shownDay} of ${LAST_DAY}`}
								onChange={(e) => {
									stop();
									setDay(Number(e.target.value));
								}}
								className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0"
							/>
							<span
								aria-hidden="true"
								className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10"
							/>
							<span
								aria-hidden="true"
								className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-500"
								style={{ width: `${progress * 100}%` }}
							/>
							<span
								aria-hidden="true"
								className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-zinc-950 transition-colors ${eventReached ? "bg-emerald-400" : "bg-zinc-500"}`}
								style={{ left: `${eventAt * 100}%` }}
							/>
							<span
								aria-hidden="true"
								className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(59_130_246/0.35)] peer-focus-visible:shadow-[0_0_0_4px_rgb(96_165_250/0.9)]"
								style={{ left: `${progress * 100}%` }}
							/>
						</div>
						<span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-200">
							Day {shownDay}
						</span>
					</div>

					<div
						className={`mt-3 flex items-start gap-3 rounded-lg bg-emerald-400/[0.06] p-3 ring-1 ring-emerald-400/20 transition-opacity duration-500 ${
							eventReached ? "opacity-100" : "opacity-40"
						}`}
					>
						<span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-400/15 text-emerald-300">
							<Link2 className="size-3.5" aria-hidden="true" />
						</span>
						<div className="min-w-0 flex-1">
							<p className="text-[13px] leading-5 text-zinc-100">
								<span className="font-mono text-[11px] text-emerald-300">Day {EVENT_DAY}</span>
								<span className="mx-1.5 text-zinc-600" aria-hidden="true">
									·
								</span>
								Fernbook earned 3 new citations on review sites
							</p>
							<p className="mt-0.5 text-xs leading-5 text-zinc-400">
								AI answers started naming it more often, moving it from{" "}
								<span className="font-mono text-zinc-300">#{youStart}</span> to{" "}
								<span className="font-mono text-blue-300">#{youNow}</span>
								{shownDay < LAST_DAY ? " so far" : " by day 30"}.
							</p>
						</div>
					</div>
				</div>
			</div>
		</figure>
	);
}
