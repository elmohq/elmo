import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight, Play } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { AnswerDemo } from "./answer-demo";

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
				className="pointer-events-none absolute inset-y-0 right-0 w-full [background-image:linear-gradient(to_right,rgb(0_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_55%_65%_at_70%_40%,black,transparent)] lg:w-3/5"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute right-[-10%] top-[18%] h-[560px] w-[760px] rounded-full bg-blue-500/15 blur-[120px] max-md:hidden"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute bottom-[8%] right-[30%] h-[280px] w-[420px] rounded-full bg-amber-400/10 blur-[100px] max-md:hidden"
			/>

			<div className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-12 pt-12 md:px-6 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center lg:gap-14 lg:pb-16 lg:pt-20">
				<div>
					<h1 className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500 sm:text-[11px] sm:tracking-[0.18em]">
						<span className="size-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
						AI visibility &amp; answer engine optimization
					</h1>
					<p className="mt-6 text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.04em] text-balance text-zinc-950 sm:text-6xl lg:text-[3.25rem] xl:text-[3.5rem]">
						AI recommends your competitors. <span className="text-blue-600">Find out why.</span>
					</p>
					<p className="mt-6 max-w-[46ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
						Buyers now ask ChatGPT, Claude, Gemini, and Perplexity what to use. Elmo shows how AI talks about your
						brand: whether you're in the answer, who's named instead, which sources it trusts, and what to fix first.
					</p>
					<div className="mt-9 flex flex-wrap items-center gap-2.5 [&>a]:h-10 [&>a]:px-4">
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

					<div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-4 border-t border-zinc-200/80 pt-6">
						<button
							type="button"
							onClick={() => setDemoOpen(true)}
							className="group inline-flex items-center gap-2 rounded-md text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
						>
							<span className="inline-flex size-5 items-center justify-center rounded-full bg-zinc-900 text-white transition-colors group-hover:bg-blue-600">
								<Play className="ml-px size-2.5 fill-current" aria-hidden="true" />
							</span>
							<span className="underline decoration-zinc-300 underline-offset-4 group-hover:decoration-zinc-900">
								Watch the demo
							</span>
						</button>
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-2 rounded-full bg-white pl-1 pr-3 text-xs text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-zinc-100 px-2 font-mono text-[11px] text-zinc-700">
								<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
							</span>
							GitHub
							<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</a>
						<G2Stars />
					</div>
				</div>

				<div className="xl:-mr-20">
					<AnswerDemo />
				</div>
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
