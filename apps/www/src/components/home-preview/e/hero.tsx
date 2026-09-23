import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight, Play } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { PromptDemo } from "./prompt-demo";

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
		<section className="relative overflow-hidden bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-[900px] [background-image:radial-gradient(rgb(24_24_27/0.09)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_55%_60%_at_50%_45%,black,transparent)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-1/2 top-[380px] h-[560px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(59_130_246/0.16),rgb(139_92_246/0.07)_55%,transparent)] max-md:w-[700px]"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pb-6 pt-12 md:px-6 md:pt-16 lg:pb-8 lg:pt-20">
				<div className="mx-auto flex max-w-5xl flex-col items-center text-center">
					<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-2 rounded-full bg-white pl-1 pr-3 text-xs text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300"
						>
							<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-zinc-100 px-2 font-mono text-[11px] text-zinc-700">
								<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
							</span>
							Open source on GitHub
							<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</a>
						<G2Stars />
					</div>

					<h1 className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
						<span className="text-blue-600">/</span> Open-source AI visibility tracking
					</h1>
					<p className="mt-4 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.04em] text-balance text-zinc-950 sm:text-6xl lg:text-[4.1rem]">
						Your customers stopped Googling. <br className="max-md:hidden" />
						<span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
							They're asking AI.
						</span>
					</p>
					<p className="mt-6 max-w-[58ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
						Elmo asks ChatGPT, Claude, Gemini, Perplexity and Google's AI the questions your buyers ask, then shows
						whether you're in the answer, where you rank, which sources it trusts, and what to fix.
					</p>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 [&>a]:h-9 [&>a]:px-4">
						<CloudSignupCTA />
						<SelfHostCTA />
					</div>
					<p className="mt-4 flex flex-col text-[13px] text-zinc-500 sm:flex-row">
						<span>Managed cloud from ${CLOUD_ENTRY_PRICE_USD}/mo</span>
						<span aria-hidden="true" className="mx-2 hidden text-zinc-300 sm:inline">
							·
						</span>
						<span>Self-hosting is free forever</span>
					</p>
				</div>

				<div className="relative mt-12 md:mt-14">
					<PromptDemo />
				</div>

				<p className="mt-8 text-center text-sm text-zinc-500">
					Elmo re-asks your prompts on a schedule and tracks every answer over time.{" "}
					<button
						type="button"
						onClick={() => setDemoOpen(true)}
						className="group inline-flex items-center gap-1.5 rounded-md font-medium text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
					>
						<Play className="size-3 fill-current" aria-hidden="true" />
						<span className="underline decoration-zinc-300 underline-offset-4 group-hover:decoration-zinc-900">
							Watch the walkthrough
						</span>
					</button>
				</p>
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
