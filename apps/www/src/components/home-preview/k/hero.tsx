import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight, Check, Play } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { PromptRun } from "./prompt-run";

const DEMO_URL = "https://demo.elmohq.com";

// Only things that hold on every Cloud plan and on self-hosted. Plans differ by
// brands, prompts and platforms, never by feature.
const INCLUDED = [
	"API & MCP access",
	"Unlimited seats",
	"Citation tracking",
	"Query fan-out",
	"Recommendations",
	"Open source (MIT)",
];

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

function IncludedStrip() {
	return (
		<div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)] lg:flex lg:items-stretch">
			<p className="flex items-center gap-2 bg-blue-600 px-5 py-3 text-[13px] font-semibold text-white lg:shrink-0 lg:px-6">
				On every Elmo plan
			</p>
			<ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-5 py-4 sm:grid-cols-3 lg:flex lg:flex-1 lg:items-center lg:justify-between lg:gap-4 lg:px-6 lg:py-3">
				{INCLUDED.map((item) => (
					<li key={item} className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-zinc-800">
						<Check className="size-3.5 shrink-0 text-blue-600" strokeWidth={3} aria-hidden="true" />
						{item}
					</li>
				))}
			</ul>
		</div>
	);
}

export function Hero() {
	const [demoOpen, setDemoOpen] = useState(false);

	return (
		<section className="relative overflow-hidden bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[linear-gradient(to_bottom,rgb(239_246_255),rgb(255_255_255/0))]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-1/2 top-[560px] h-[480px] w-[1100px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[120px] max-md:w-[600px]"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pb-6 pt-14 md:px-6 md:pt-20 lg:pt-24">
				<div className="mx-auto flex max-w-5xl flex-col items-center text-center">
					<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-2 rounded-full bg-white pl-1 pr-3 text-xs text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300"
						>
							<span className="inline-flex h-5 items-center rounded-full bg-blue-600 px-2 text-[11px] font-semibold text-white">
								MIT
							</span>
							Open source on GitHub
							<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</a>
						<G2Stars />
					</div>

					<h1 className="mt-8 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.04em] text-balance text-zinc-950 sm:text-6xl lg:text-[4.4rem]">
						AI visibility tracking <span className="text-blue-600 lg:block">without the enterprise gate.</span>
					</h1>
					<p className="mt-6 max-w-[62ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
						See how ChatGPT, Claude, Gemini, Perplexity and Google's AI answer your buyers' questions: whether you're
						mentioned, where you rank, and which sources they trust.
					</p>
					<p className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-base font-semibold tracking-[-0.01em] text-zinc-950 md:text-lg">
						<span>Self-host free</span>
						<span aria-hidden="true" className="h-4 w-px bg-zinc-300" />
						<span>
							Cloud from <span className="text-blue-600">${CLOUD_ENTRY_PRICE_USD}/mo</span>
						</span>
						<span aria-hidden="true" className="h-4 w-px bg-zinc-300 max-sm:hidden" />
						<span className="max-sm:hidden">Unlimited seats</span>
					</p>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 [&>a]:h-10 [&>a]:rounded-lg [&>a]:px-5">
						<CloudSignupCTA />
						<SelfHostCTA />
					</div>
					<p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-zinc-500">
						<span>No sales call. Try the</span>
						<a
							href={DEMO_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800"
						>
							live demo
						</a>
						<span>or</span>
						<button
							type="button"
							onClick={() => setDemoOpen(true)}
							className="group inline-flex items-center gap-1.5 rounded-sm font-medium text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
						>
							<Play className="size-3 fill-current" aria-hidden="true" />
							<span className="underline decoration-zinc-300 underline-offset-4 group-hover:decoration-zinc-800">
								watch the walkthrough
							</span>
						</button>
					</p>
				</div>

				<div className="relative mt-14 md:mt-16">
					<PromptRun />
					<IncludedStrip />
				</div>
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
