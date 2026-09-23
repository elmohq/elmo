import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { ArrowUpRight } from "lucide-react";
import { AnthropicIcon, GeminiIcon, GoogleIcon, OpenAIIcon, PerplexityIcon } from "./icons";
import { Terminal } from "./terminal";
import { CloudCTA, FOCUS_RING, QuietLink, ScreenFrame, SelfHostCTA } from "./ui";

interface EngineResult {
	name: string;
	icon: () => React.ReactNode;
	/** Rank among brands named in the answer; null when the brand is absent. */
	rank: number | null;
	of: number;
}

// An invented sample run: this diagram explains the product, it does not report data.
const SAMPLE: EngineResult[] = [
	{ name: "ChatGPT", icon: OpenAIIcon, rank: 2, of: 6 },
	{ name: "Claude", icon: AnthropicIcon, rank: 1, of: 4 },
	{ name: "Gemini", icon: GeminiIcon, rank: null, of: 5 },
	{ name: "Perplexity", icon: PerplexityIcon, rank: 1, of: 5 },
	{ name: "AI Overviews", icon: GoogleIcon, rank: 3, of: 7 },
];

const mentioned = SAMPLE.filter((e) => e.rank !== null);
const visibility = Math.round((mentioned.length / SAMPLE.length) * 100);

function FanOut() {
	return (
		<figure className="relative">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(60%_60%_at_60%_40%,rgb(37_99_235/0.22),transparent_70%)] blur-xl"
			/>
			<div className="relative overflow-hidden rounded-xl bg-zinc-900/80 ring-1 ring-white/10 backdrop-blur">
				<div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Prompt run</span>
					<span className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-400 ring-1 ring-white/10">
						Example
					</span>
				</div>

				<div className="p-4 sm:p-5">
					<div className="rounded-lg bg-black/40 px-3.5 py-3 ring-1 ring-white/10">
						<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Prompt</p>
						<p className="mt-1.5 text-[15px] leading-snug text-zinc-100">
							What&apos;s the best CRM for a small sales team?
						</p>
					</div>

					<ul className="relative mt-2 pl-7">
						<span aria-hidden="true" className="absolute top-0 bottom-[22px] left-3.5 w-px bg-white/15" />
						{SAMPLE.map((engine) => {
							const Icon = engine.icon;
							const hit = engine.rank !== null;
							return (
								<li key={engine.name} className="relative flex h-11 items-center gap-3">
									<span aria-hidden="true" className="absolute top-1/2 -left-3.5 h-px w-3 bg-white/15" />
									<span
										className={`flex size-7 shrink-0 items-center justify-center rounded-md p-1.5 ring-1 ${hit ? "bg-white/[0.06] text-zinc-100 ring-white/10" : "bg-transparent text-zinc-500 ring-white/5"}`}
									>
										<Icon />
									</span>
									<span className={`min-w-0 flex-1 truncate text-sm ${hit ? "text-zinc-200" : "text-zinc-500"}`}>
										{engine.name}
									</span>
									{hit ? (
										<span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400/10 px-2 py-1 font-mono text-[11px] text-emerald-300 ring-1 ring-emerald-400/20">
											<span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />
											Mentioned
											<span className="text-emerald-300/70">
												#{engine.rank}/{engine.of}
											</span>
										</span>
									) : (
										<span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-zinc-400 ring-1 ring-white/10">
											<span aria-hidden="true" className="size-1.5 rounded-full bg-zinc-600" />
											Not mentioned
										</span>
									)}
								</li>
							);
						})}
					</ul>
				</div>

				<div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 bg-black/30">
					<div className="px-4 py-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">Visibility</p>
						<p className="mt-1 text-xl font-semibold tracking-tight text-white tabular-nums">{visibility}%</p>
					</div>
					<div className="px-4 py-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">Mentions</p>
						<p className="mt-1 text-xl font-semibold tracking-tight text-white tabular-nums">
							{mentioned.length}
							<span className="text-zinc-500">/{SAMPLE.length}</span>
						</p>
					</div>
					<div className="px-4 py-3">
						<p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">Engines</p>
						<div className="mt-2.5 flex gap-1" aria-hidden="true">
							{SAMPLE.map((e) => (
								<span
									key={e.name}
									className={`h-2 flex-1 rounded-sm ${e.rank !== null ? "bg-blue-500" : "bg-white/10"}`}
								/>
							))}
						</div>
					</div>
				</div>
			</div>
			<figcaption className="sr-only">
				Illustration: one prompt is sent to five AI engines, and Elmo records which answers mention your brand.
			</figcaption>
		</figure>
	);
}

export function Hero() {
	return (
		<section className="relative overflow-hidden">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.045)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(37_99_235/0.28),transparent)]"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pt-14 md:px-6 lg:pt-24">
				<div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
					<div className="lg:col-span-7">
						<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
							<a
								href="https://github.com/elmohq/elmo"
								target="_blank"
								rel="noopener noreferrer"
								className={`group inline-flex items-center gap-2 rounded-full bg-white/[0.04] py-1 pr-3 pl-1 font-mono text-[11px] text-zinc-300 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08] hover:text-white ${FOCUS_RING}`}
							>
								<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-300 ring-1 ring-emerald-400/20">
									<span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />v{__APP_VERSION__}
								</span>
								Open source · MIT
								<ArrowUpRight
									className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
									aria-hidden="true"
								/>
							</a>
							<G2Stars />
						</div>

						<h1 className="mt-7 max-w-[15ch] text-balance text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.25rem]">
							Know how{" "}
							<span className="bg-gradient-to-br from-sky-200 via-blue-400 to-blue-600 bg-clip-text text-transparent">
								AI talks
							</span>{" "}
							about your brand.
						</h1>
						<p className="mt-6 max-w-[54ch] text-pretty text-base/7 text-zinc-400 md:text-lg/8">
							Track your visibility across ChatGPT, Claude, Gemini, Perplexity, and every other major AI model. Monitor
							mentions, analyze citations, and benchmark competitors — in our cloud or on your own infrastructure.
							It&apos;s open source, so your data stays yours.
						</p>

						<div className="mt-8 flex flex-wrap items-center gap-2.5">
							<CloudCTA />
							<SelfHostCTA />
							<QuietLink href="https://demo.elmohq.com">Live demo</QuietLink>
						</div>
						<p className="mt-4 flex flex-col gap-1 font-mono text-xs text-zinc-500 sm:flex-row sm:gap-0">
							<span>
								Managed cloud from <span className="text-zinc-300">${CLOUD_ENTRY_PRICE_USD}/mo</span>
							</span>
							<span aria-hidden="true" className="mx-2 hidden text-zinc-700 sm:inline">
								·
							</span>
							<span>
								Self-hosting is <span className="text-zinc-300">free forever</span>
							</span>
						</p>

						<Terminal className="mt-10 max-w-md" />
					</div>

					<div className="lg:col-span-5">
						<FanOut />
					</div>
				</div>

				<ScreenFrame
					src="/screenshots/overview.png"
					alt="Elmo overview dashboard showing a 71% AI visibility score, 14% share of voice, and 30-day trend charts."
					label="demo.elmohq.com"
					priority
					glow
					className="mt-16 lg:mt-24"
				/>
			</div>
		</section>
	);
}
