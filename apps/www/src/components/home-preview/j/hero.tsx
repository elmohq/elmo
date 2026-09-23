import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { Play } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { Specimen } from "./specimen";
import { InkLink, REPO_URL } from "./ui";

const DEMO_APP_URL = "https://demo.elmohq.com";

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

/** The document header: a spec-sheet masthead that states what the product is before the pitch does. */
function Masthead() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[#1c1a17]/12 pb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-600">
			<p>
				<span className="text-[#1c1a17]">Elmo</span>
				<span className="mx-2 text-stone-300" aria-hidden="true">
					/
				</span>
				AI visibility tracker
			</p>
			<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
				<a
					href={REPO_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-2 rounded-sm transition-colors hover:text-[#1c1a17] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
				>
					<span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
					Open source · MIT · v{__APP_VERSION__}
				</a>
				<span className="normal-case tracking-normal [&_*]:!text-[12px]">
					<G2Stars />
				</span>
			</div>
		</div>
	);
}

export function Hero() {
	const [demoOpen, setDemoOpen] = useState(false);

	return (
		<section className="relative">
			<div className="mx-auto max-w-6xl px-4 pt-8 md:px-6 md:pt-12">
				<Masthead />

				<div className="grid gap-8 pb-12 pt-12 md:pt-16 lg:grid-cols-12 lg:items-end lg:gap-12 lg:pb-14 lg:pt-16">
					<h1 className="text-[3rem] font-semibold leading-[0.98] tracking-[-0.045em] text-balance text-[#1c1a17] sm:text-[4.25rem] lg:col-span-7 lg:text-[5.75rem]">
						AI visibility you can <span className="text-blue-600">verify.</span>
					</h1>
					<div className="lg:col-span-5">
						<p className="max-w-[46ch] text-pretty text-[17px]/7 text-stone-700">
							Know how ChatGPT, Gemini, Perplexity, Claude and Google AI Overviews talk about your brand — and exactly
							how every number was measured. Elmo is open source, so the scoring code is public.
						</p>
						<div className="mt-7 flex flex-wrap items-center gap-2.5 [&>a]:h-10 [&>a]:px-4 [&>a]:text-[15px]">
							<CloudSignupCTA />
							<SelfHostCTA />
						</div>
						<ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-stone-600">
							<li className="font-medium text-[#1c1a17]">Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo</li>
							<li>Self-host free forever</li>
							<li>No sales call</li>
						</ul>
						<p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
							<button
								type="button"
								onClick={() => setDemoOpen(true)}
								className="group inline-flex items-center gap-2 rounded-sm font-medium text-[#1c1a17] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
							>
								<span className="inline-flex size-5 items-center justify-center rounded-full bg-[#1c1a17] text-white transition-colors group-hover:bg-blue-600">
									<Play className="ml-px size-2.5 fill-current" aria-hidden="true" />
								</span>
								<span className="underline decoration-stone-300 underline-offset-4 group-hover:decoration-[#1c1a17]">
									Watch the walkthrough
								</span>
							</button>
							<InkLink href={DEMO_APP_URL}>Explore the live demo</InkLink>
						</p>
					</div>
				</div>

				<Specimen />
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
