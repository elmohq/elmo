import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight, Play } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { InfluenceMap } from "./influence-map";

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
				className="pointer-events-none absolute inset-x-0 top-0 h-[760px] [background-image:linear-gradient(to_right,rgb(0_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.035)_1px,transparent_1px)] [background-size:56px_56px] [background-position:center_top] [mask-image:radial-gradient(ellipse_70%_70%_at_30%_0%,black,transparent)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-1/2 top-[560px] h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[120px] max-md:hidden"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute right-[8%] top-[640px] h-[260px] w-[360px] rounded-full bg-amber-400/15 blur-[100px] max-lg:hidden"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pb-4 pt-12 md:px-6 md:pt-16 lg:pt-20">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
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

				<div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
					<div className="lg:col-span-7">
						<h1 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
							<span className="text-blue-600">/</span> AI visibility &amp; answer engine optimization
						</h1>
						<p className="mt-5 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-balance text-zinc-950 sm:text-6xl lg:text-[4.25rem]">
							See what AI reads before it{" "}
							<span className="relative whitespace-nowrap text-blue-600">recommends you.</span>
						</p>
					</div>
					<div className="lg:col-span-5 lg:pb-2">
						<p className="max-w-[46ch] text-pretty text-base/7 text-zinc-600 md:text-[17px]/7">
							ChatGPT, Claude, Gemini and Perplexity build their answers from the pages they cite. Elmo tracks how they
							talk about your brand, which sources shape those answers, and where competitors show up and you don't.
						</p>
						<div className="mt-7 flex flex-wrap items-center gap-2.5 [&>a]:h-9 [&>a]:px-4">
							<CloudSignupCTA />
							<SelfHostCTA />
						</div>
						<p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-500">
							<span>Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo</span>
							<span aria-hidden="true" className="text-zinc-300">
								·
							</span>
							<span>Self-host free forever</span>
						</p>
						<button
							type="button"
							onClick={() => setDemoOpen(true)}
							className="group mt-3 inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
						>
							<Play className="size-3 fill-current" aria-hidden="true" />
							<span className="underline decoration-zinc-300 underline-offset-4 group-hover:decoration-zinc-900">
								Watch the product walkthrough
							</span>
						</button>
					</div>
				</div>

				<div className="relative mt-12 md:mt-16">
					<InfluenceMap />
				</div>
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
