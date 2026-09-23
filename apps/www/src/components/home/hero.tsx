import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight, Play } from "lucide-react";
import { useState } from "react";
import { AnswerStory } from "./answer-story";
import { CtaPair } from "./cta";
import { HOME_FONT_CLASS } from "./styles";

function WalkthroughDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={`${HOME_FONT_CLASS} gap-0 overflow-hidden bg-zinc-950 p-0 sm:max-w-5xl [&>button]:text-white`}
			>
				<DialogTitle className="sr-only">Elmo product walkthrough</DialogTitle>
				{/* Mounted only while open, so the player's script and poster cost nothing up front. */}
				{open ? (
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
				) : null}
			</DialogContent>
		</Dialog>
	);
}

export function Hero() {
	const [videoOpen, setVideoOpen] = useState(false);

	return (
		<section className="relative overflow-hidden bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-[900px] bg-[radial-gradient(60%_55%_at_50%_0%,rgb(219_234_254/0.9),rgb(239_246_255/0.5)_45%,transparent_80%)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-1/2 top-[640px] h-[420px] w-[1000px] -translate-x-1/2 rounded-full bg-blue-400/10 blur-[120px] max-md:hidden"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 md:px-6 md:pt-20 lg:pb-28">
				<div className="mx-auto flex max-w-3xl flex-col items-center text-center">
					<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-2 rounded-full bg-white/80 pl-1 pr-3 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300"
						>
							<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-zinc-100 px-2 font-mono text-[11px] font-normal text-zinc-700">
								<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
							</span>
							Open source on GitHub
							<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</a>
						<G2Stars />
					</div>

					<h1 className="mt-8 text-[3.5rem] font-semibold leading-[0.95] tracking-[-0.045em] text-zinc-950 sm:text-7xl lg:text-[6.5rem]">
						Win AI Search
					</h1>
					<p className="mt-6 max-w-[62ch] text-pretty text-[17px]/7 text-zinc-600 md:text-xl/8">
						Elmo is the AI visibility platform that shows how ChatGPT, Google AI Overviews, Gemini, Perplexity, and
						Claude talk about your brand, and what to change so they recommend you.
					</p>
					<div className="mt-9">
						<CtaPair size="lg" />
					</div>
					<p className="mt-5 flex flex-col items-center justify-center gap-x-2 gap-y-1.5 text-sm text-zinc-500 sm:flex-row">
						<span>Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo, fully self-serve</span>
						<span aria-hidden="true" className="text-zinc-300 max-sm:hidden">
							·
						</span>
						<button
							type="button"
							onClick={() => setVideoOpen(true)}
							className="group inline-flex items-center gap-1.5 rounded-sm font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 hover:decoration-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							<Play className="size-3 fill-current" aria-hidden="true" />
							Watch the walkthrough
						</button>
					</p>
				</div>

				<div className="mt-16 md:mt-20">
					<AnswerStory />
				</div>
			</div>
			<WalkthroughDialog open={videoOpen} onOpenChange={setVideoOpen} />
		</section>
	);
}
