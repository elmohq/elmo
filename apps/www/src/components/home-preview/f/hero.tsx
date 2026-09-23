import MuxPlayer from "@mux/mux-player-react";
import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight, Play } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA } from "@/components/cta-buttons";
import { ShareOfVoiceRace } from "./leaderboard";

export const HERO_ID = "hero-f";

function DemoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-0 overflow-hidden bg-zinc-950 p-0 sm:max-w-5xl [&>button]:text-white">
				<DialogTitle className="sr-only">Elmo product demo</DialogTitle>
				<MuxPlayer
					playbackId="PYV9FNIG008vlkchyQf9KMTxDt028zQdshaM4VLC6lS1Q"
					streamType="on-demand"
					accentColor="#2563eb"
					poster="/demo-poster.png"
					autoPlay
					metadata={{
						video_id: "KGvs37kE02Z6mnTpcrnLJCtiS01V023aJEHK3MZlmaULPA",
						video_title: "Elmo demo",
					}}
					style={{ aspectRatio: "16 / 9", display: "block", width: "100%" }}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function Hero() {
	const [demoOpen, setDemoOpen] = useState(false);

	return (
		// Pulled up under the sticky navbar so its translucent dark bar sits on the band, not on white.
		<section id={HERO_ID} className="relative -mt-14 overflow-hidden bg-zinc-950 pt-14 text-white">
			<div aria-hidden="true" className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(55%_60%_at_72%_42%,rgb(37_99_235/0.32),transparent_70%)] max-lg:bg-[radial-gradient(90%_45%_at_50%_72%,rgb(37_99_235/0.3),transparent_70%)]" />
				<div className="absolute inset-0 bg-[radial-gradient(40%_40%_at_15%_0%,rgb(59_130_246/0.12),transparent_70%)]" />
				<div className="absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)]" />
				<div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />
			</div>

			<div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 md:px-6 md:pt-16 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-20 lg:pt-20">
				<div className="min-w-0 lg:col-span-5">
					<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-2 rounded-full bg-white/[0.04] pl-1 pr-3 text-xs text-zinc-300 ring-1 ring-white/10 transition hover:text-white hover:ring-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
						>
							<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-white/[0.07] px-2 font-mono text-[11px] text-zinc-200">
								<span className="size-1.5 rounded-full bg-emerald-400" />v{__APP_VERSION__}
							</span>
							Open source on GitHub
							<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</a>
						<G2Stars />
					</div>

					<h1 className="mt-9 text-sm font-medium text-blue-300 md:text-base">
						AI visibility tracking for ChatGPT, Claude, Gemini, Perplexity &amp; Google AI&nbsp;Overviews
					</h1>
					<p className="mt-3 text-[3.5rem] font-semibold leading-[0.95] tracking-[-0.045em] text-white sm:text-7xl xl:text-[5.5rem]">
						Win the
						<br />
						<span className="bg-gradient-to-r from-blue-400 via-blue-300 to-sky-200 bg-clip-text text-transparent">
							answer.
						</span>
					</p>
					<p className="mt-6 max-w-[46ch] text-pretty text-base/7 text-zinc-400 md:text-lg/8">
						When buyers ask AI for a recommendation, only a few brands get named. Elmo shows where you rank against
						competitors in every answer, which sources the engines cite, and what to do to climb.
					</p>

					<div className="mt-8 flex flex-wrap items-center gap-2.5 [&>a]:h-9 [&>a]:px-4">
						<CloudSignupCTA />
						<Link
							to="/docs"
							className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.05] text-sm font-medium leading-none text-white ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:ring-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
						>
							Self-host free
						</Link>
					</div>
					<p className="mt-4 flex flex-col text-[13px] text-zinc-500 sm:flex-row">
						<span>Managed cloud from ${CLOUD_ENTRY_PRICE_USD}/mo</span>
						<span aria-hidden="true" className="mx-2 hidden text-zinc-700 sm:inline">
							·
						</span>
						<span>Self-hosting is free forever</span>
					</p>
					<button
						type="button"
						onClick={() => setDemoOpen(true)}
						className="group mt-6 inline-flex items-center gap-2 rounded-md text-sm font-medium text-zinc-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400"
					>
						<span className="inline-flex size-5 items-center justify-center rounded-full bg-white text-zinc-950 transition-colors group-hover:bg-blue-500 group-hover:text-white">
							<Play className="ml-px size-2.5 fill-current" aria-hidden="true" />
						</span>
						<span className="underline decoration-zinc-600 underline-offset-4 group-hover:decoration-zinc-300">
							Watch the product walkthrough
						</span>
					</button>
				</div>

				<div className="min-w-0 lg:col-span-7">
					<ShareOfVoiceRace />
				</div>
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
