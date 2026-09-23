import { Braces, LayoutDashboard, Sparkles } from "lucide-react";
import { useState } from "react";
import { MODELS } from "./models";

// Every number here is illustrative and the brands are made up, so nobody reads
// the panel as a real customer's results. The point it makes is structural: the
// dashboard, the REST API and the MCP server hand back the same figures.

type BrandId = "voltara" | "rideloom" | "pedalcraft" | "spokesmith" | "urbano";

const BRANDS: { id: BrandId; name: string; mark: string; you?: boolean }[] = [
	{ id: "voltara", name: "Voltara", mark: "bg-amber-400/15 text-amber-300" },
	{ id: "rideloom", name: "Rideloom", mark: "bg-blue-500 text-white", you: true },
	{ id: "pedalcraft", name: "Pedalcraft", mark: "bg-emerald-400/15 text-emerald-300" },
	{ id: "spokesmith", name: "Spokesmith", mark: "bg-violet-400/15 text-violet-300" },
	{ id: "urbano", name: "Urbano", mark: "bg-rose-400/15 text-rose-300" },
];

type EngineId = "all" | "chatgpt" | "perplexity" | "gemini" | "google-ai-overview";

const ENGINES: { id: EngineId; label: string; model?: string }[] = [
	{ id: "all", label: "All engines" },
	{ id: "chatgpt", label: "ChatGPT", model: "ChatGPT" },
	{ id: "perplexity", label: "Perplexity", model: "Perplexity" },
	{ id: "gemini", label: "Gemini", model: "Gemini" },
	{ id: "google-ai-overview", label: "AI Overviews", model: "Google AI Overviews" },
];

/** Share of voice (%) per engine; each row sums to 100. */
const SHARE: Record<EngineId, Record<BrandId, number>> = {
	all: { voltara: 27, rideloom: 24, pedalcraft: 21, spokesmith: 17, urbano: 11 },
	chatgpt: { voltara: 26, rideloom: 29, pedalcraft: 20, spokesmith: 15, urbano: 10 },
	perplexity: { voltara: 30, rideloom: 21, pedalcraft: 23, spokesmith: 16, urbano: 10 },
	gemini: { voltara: 28, rideloom: 25, pedalcraft: 18, spokesmith: 19, urbano: 10 },
	"google-ai-overview": { voltara: 25, rideloom: 22, pedalcraft: 26, spokesmith: 13, urbano: 14 },
};

/** How often the highlighted brand is named at all (%). */
const VISIBILITY: Record<EngineId, number> = {
	all: 58,
	chatgpt: 66,
	perplexity: 49,
	gemini: 57,
	"google-ai-overview": 52,
};

const BAR_MAX = 32;

function ranked(engine: EngineId) {
	return BRANDS.map((b) => ({ ...b, share: SHARE[engine][b.id] }))
		.sort((a, b) => b.share - a.share)
		.map((b, i) => ({ ...b, rank: i + 1 }));
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

const ratio = (pct: number) => (pct / 100).toFixed(2);

// Syntax colors, kept to four so the code reads as code without turning into confetti.
const K = "text-sky-300";
const S = "text-emerald-300";
const N = "text-amber-200";
const P = "text-zinc-500";

function ApiView({ engine }: { engine: EngineId }) {
	const rows = ranked(engine);
	const you = rows.find((r) => r.you);
	return (
		<div className="font-mono text-[11.5px] leading-[1.7] text-zinc-300 sm:text-xs sm:leading-[1.75]">
			<p className="whitespace-pre">
				<span className="select-none text-zinc-600">$ </span>
				<span className="text-white">curl</span> -G https://app.elmohq.com/api/v1/brands/
				<span className={N}>$BRAND</span>/analytics \
			</p>
			<p className="whitespace-pre">{"    "}-d start=2026-08-24T00:00:00Z -d end=2026-09-23T00:00:00Z \</p>
			{engine !== "all" ? (
				<p className="whitespace-pre">
					{"    "}-d model=<span className="text-blue-300">{engine}</span> \
				</p>
			) : null}
			<p className="whitespace-pre">
				{"    "}-H <span className={S}>"Authorization: Bearer $ELMO_API_KEY"</span>
			</p>

			<div className="mt-3 border-t border-white/[0.06] pt-3">
				<p className={P}>{"// 200 OK · trimmed"}</p>
				<p>{"{"}</p>
				<p className="whitespace-pre">
					{"  "}
					<span className={K}>"brandName"</span>: <span className={S}>"Rideloom"</span>,
				</p>
				<p className="whitespace-pre">
					{"  "}
					<span className={K}>"visibility"</span>: {"{ "}
					<span className={K}>"current"</span>: <span className={N}>{ratio(VISIBILITY[engine])}</span>
					{" },"}
				</p>
				<p className="whitespace-pre">
					{"  "}
					<span className={K}>"shareOfVoice"</span>: {"{"}
				</p>
				<p className="whitespace-pre">
					{"    "}
					<span className={K}>"brand"</span>: <span className={N}>{ratio(you?.share ?? 0)}</span>,
				</p>
				<p className="whitespace-pre">
					{"    "}
					<span className={K}>"entries"</span>: [
				</p>
				{rows.map((r) => (
					<p
						key={`${engine}-${r.id}`}
						className={`-mx-2 whitespace-pre rounded px-2 motion-safe:animate-[m-flash_900ms_ease-out] ${r.you ? "bg-blue-500/[0.12] text-zinc-100" : ""}`}
					>
						{"      { "}
						<span className={K}>"name"</span>: <span className={S}>"{r.name}"</span>, <span className={K}>"share"</span>
						: <span className={N}>{ratio(r.share)}</span>
						{r.rank < rows.length ? " }," : " }"}
					</p>
				))}
				<p className="whitespace-pre">{"    ]"}</p>
				<p className="whitespace-pre">{"  }"}</p>
				<p>{"}"}</p>
			</div>
		</div>
	);
}

function McpView({ engine }: { engine: EngineId }) {
	const rows = ranked(engine);
	const you = rows.find((r) => r.you);
	const leader = rows[0];
	const label = ENGINES.find((e) => e.id === engine)?.label ?? "";
	const where = engine === "all" ? "across all engines" : `on ${label}`;
	const behind = you && you.rank > 1 ? `, behind ${leader.name} at ${leader.share}%` : ", ahead of every competitor";

	return (
		<div className="space-y-4 text-[13px] leading-6">
			<div className="flex gap-2.5">
				<span className="select-none font-mono text-zinc-500">&gt;</span>
				<p className="text-zinc-100">How is Rideloom doing {where} this month, and who&apos;s beating us?</p>
			</div>
			<div className="rounded-lg bg-white/[0.03] px-3 py-2.5 font-mono text-[11.5px] leading-5 ring-1 ring-white/[0.06]">
				<p className="text-zinc-300">
					<span className="text-emerald-400">●</span> elmo · <span className="text-white">get_analytics</span>
				</p>
				<p className="whitespace-pre text-zinc-500">
					{"  "}brand: Rideloom{engine !== "all" ? ` · model: ${engine}` : ""} · last 30 days
				</p>
				<p className="mt-1 text-zinc-300">
					<span className="text-emerald-400">●</span> elmo · <span className="text-white">get_citations</span>
				</p>
				<p className="whitespace-pre text-zinc-500">{"  "}top cited domains · 30 days</p>
			</div>
			<p key={engine} className="text-pretty text-zinc-300 motion-safe:animate-[m-fade_500ms_ease-out]">
				Rideloom is named in <span className="font-medium text-white">{VISIBILITY[engine]}%</span> of answers {where}{" "}
				and ranks <span className="font-medium text-blue-300">#{you?.rank}</span> by share of voice at {you?.share}%
				{behind}. The pages cited most are review roundups Rideloom isn&apos;t in yet; want me to list them?
			</p>
			<p className="font-mono text-[11px] text-zinc-500">Claude Code · Cursor · VS Code · any MCP client</p>
		</div>
	);
}

type View = "api" | "mcp";

export function OwnershipConsole() {
	const [engine, setEngine] = useState<EngineId>("all");
	const [view, setView] = useState<View>("api");
	const rows = ranked(engine);
	const you = rows.find((r) => r.you);

	return (
		<figure className="relative rounded-[20px] bg-white/[0.04] p-1.5 shadow-[0_0_0_1px_rgb(255_255_255/0.09),0_40px_100px_-30px_rgb(37_99_235/0.55),0_30px_60px_-30px_rgb(0_0_0/0.6)] backdrop-blur">
			<style>{`
				@keyframes m-flash { from { background-color: rgb(59 130 246 / 0.22); } }
				@keyframes m-fade { from { opacity: 0; transform: translateY(4px); } }
			`}</style>
			<figcaption className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 pb-2.5 pt-2 sm:px-4">
				<span className="rounded-full bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300 ring-1 ring-amber-400/25">
					Example
				</span>
				<span className="text-[13px] text-zinc-300">
					Share of voice for <span className="text-zinc-100">“best e-bike for city commuting”</span>
				</span>
				<span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 md:inline">
					Fictional brands · illustrative data
				</span>
			</figcaption>

			<div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[14px] bg-[#070b16] ring-1 ring-white/[0.07] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
				{/* Dashboard pane */}
				<div className="flex min-w-0 flex-col border-white/[0.07] max-lg:border-b lg:border-r">
					<div className="flex h-11 items-center gap-2 border-b border-white/[0.07] px-4 text-xs text-zinc-400">
						<LayoutDashboard className="size-3.5 text-zinc-500" aria-hidden="true" />
						<span className="font-medium text-zinc-200">Dashboard</span>
						<span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
							app.elmohq.com
						</span>
					</div>

					<fieldset className="flex min-w-0 gap-1 overflow-x-auto px-3 pt-3 [scrollbar-width:none] sm:px-4">
						<legend className="sr-only">AI engine</legend>
						{ENGINES.map((e) => {
							const active = e.id === engine;
							return (
								<button
									key={e.id}
									type="button"
									aria-pressed={active}
									onClick={() => setEngine(e.id)}
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

					<ol className="sr-only">
						{rows.map((r) => (
							<li key={r.id}>
								{r.name}
								{r.you ? " (your brand)" : ""}: rank {r.rank}, {r.share}% share of voice
							</li>
						))}
					</ol>

					<div
						aria-hidden="true"
						className="relative mx-2 mb-3 mt-3 h-[calc(5*var(--row))] [--row:2.625rem] sm:mx-3 sm:[--row:3rem] lg:[--row:3.375rem]"
					>
						{BRANDS.map((b) => {
							const r = rows.find((x) => x.id === b.id);
							if (!r) return null;
							return (
								<div
									key={b.id}
									className="absolute inset-x-0 top-0 h-[var(--row)] py-1 transition-transform duration-500 ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none"
									style={{ transform: `translateY(calc(${r.rank - 1} * var(--row)))`, zIndex: r.you ? 2 : 1 }}
								>
									<div
										className={`grid h-full grid-cols-[1.25rem_5.5rem_1fr_2.5rem] items-center gap-x-2.5 rounded-lg px-2 sm:grid-cols-[1.25rem_8rem_1fr_2.75rem] sm:gap-x-3 ${
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
										</span>
										<span className="relative h-2 overflow-hidden rounded-full bg-white/[0.05]">
											<span
												className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${
													r.you
														? "bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_14px_rgb(59_130_246/0.7)]"
														: "bg-zinc-600"
												}`}
												style={{ width: `${Math.min(100, (r.share / BAR_MAX) * 100)}%` }}
											/>
										</span>
										<span
											className={`text-right font-mono text-xs tabular-nums sm:text-[13px] ${r.you ? "text-white" : "text-zinc-400"}`}
										>
											{r.share}%
										</span>
									</div>
								</div>
							);
						})}
					</div>

					<dl className="mt-auto grid grid-cols-3 border-t border-white/[0.07] text-xs">
						<div className="px-4 py-3">
							<dt className="text-zinc-500">Visibility</dt>
							<dd className="mt-0.5 font-mono text-sm tabular-nums text-white">{VISIBILITY[engine]}%</dd>
						</div>
						<div className="border-l border-white/[0.07] px-4 py-3">
							<dt className="text-zinc-500">Rank</dt>
							<dd className="mt-0.5 font-mono text-sm tabular-nums text-blue-300">#{you?.rank}</dd>
						</div>
						<div className="border-l border-white/[0.07] px-4 py-3">
							<dt className="text-zinc-500">Prompts</dt>
							<dd className="mt-0.5 font-mono text-sm tabular-nums text-white">40</dd>
						</div>
					</dl>
				</div>

				{/* Code pane */}
				<div className="min-w-0 bg-black/30">
					<div
						role="tablist"
						aria-label="Get the same data"
						className="flex h-11 items-center gap-1 border-b border-white/[0.07] px-2 sm:px-3"
					>
						{(
							[
								{ id: "api", label: "REST API", icon: Braces },
								{ id: "mcp", label: "MCP", icon: Sparkles },
							] as const
						).map((t) => {
							const active = view === t.id;
							const Icon = t.icon;
							return (
								<button
									key={t.id}
									type="button"
									role="tab"
									id={`m-tab-${t.id}`}
									aria-selected={active}
									aria-controls="m-code-panel"
									onClick={() => setView(t.id)}
									className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400 ${
										active ? "bg-white/10 text-white ring-1 ring-white/15" : "text-zinc-400 hover:text-zinc-200"
									}`}
								>
									<Icon className="size-3.5" aria-hidden="true" />
									{t.label}
								</button>
							);
						})}
						<span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600 sm:inline">
							Same numbers · every plan
						</span>
					</div>
					<div
						id="m-code-panel"
						role="tabpanel"
						aria-labelledby={`m-tab-${view}`}
						className="overflow-x-auto px-4 py-4 [scrollbar-width:thin] sm:px-5"
					>
						{/* Both views share one grid cell so switching tabs doesn't resize the card. */}
						<div className="grid [&>*]:[grid-area:1/1]">
							<div className={view === "api" ? "" : "invisible"} aria-hidden={view !== "api"}>
								<ApiView engine={engine} />
							</div>
							<div className={view === "mcp" ? "" : "invisible"} aria-hidden={view !== "mcp"}>
								<McpView engine={engine} />
							</div>
						</div>
					</div>
				</div>
			</div>
		</figure>
	);
}
