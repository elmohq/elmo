import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight, Play } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { ProductTour } from "./tour";

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
				className="pointer-events-none absolute inset-x-0 top-0 h-[720px] [background-image:linear-gradient(to_right,rgb(0_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.035)_1px,transparent_1px)] [background-size:56px_56px] [background-position:center_top] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_0%,black,transparent)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-1/2 top-[520px] max-md:hidden h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[120px]"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pb-4 pt-14 md:px-6 md:pt-20 lg:pt-24">
				<div className="mx-auto flex max-w-3xl flex-col items-center text-center">
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

					<h1 className="mt-8 text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] text-balance text-zinc-950 sm:text-6xl lg:text-[4.5rem]">
						Know how AI talks about your brand
					</h1>
					<p className="mt-6 max-w-[60ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
						Track your visibility across every major AI model. Monitor mentions, analyze citations, and benchmark
						competitors — in our cloud or on your own servers. It's open source, so your data stays yours.
					</p>
					<div className="mt-9 flex flex-wrap items-center justify-center gap-2.5 [&>a]:h-9 [&>a]:px-4">
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
					<p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
						<button
							type="button"
							onClick={() => setDemoOpen(true)}
							className="group inline-flex items-center gap-2 font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							<span className="inline-flex size-5 items-center justify-center rounded-full bg-zinc-950 text-white transition-colors group-hover:bg-blue-600">
								<Play className="ml-px size-2.5 fill-current" aria-hidden="true" />
							</span>
							Watch the walkthrough
						</button>
						<a
							href="https://demo.elmohq.com"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex items-center gap-1 font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							Explore the live demo
							<ArrowUpRight
								className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
					</p>
				</div>

				<div id="product-tour" className="relative mt-14 scroll-mt-24 md:mt-16">
					<ProductTour />
				</div>
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
