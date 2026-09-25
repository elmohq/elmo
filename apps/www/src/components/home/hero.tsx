import { Link } from "@tanstack/react-router";
import { cloudAppUrl, demoSiteUrl } from "@workspace/config/referrals";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { externalRel } from "@/lib/external-link";
import { SELF_HOST_LINK } from "@/lib/self-host-link";
import { ProductDemo } from "./product-demo";
import { HOME_FONT_CLASS } from "./styles";

// The player bundles hls.js, several times the weight of the rest of the page.
const MuxPlayer = lazy(() => import("@mux/mux-player-react"));

const CLOUD_URL = cloudAppUrl("marketing-hero");

const DEMO_URL = demoSiteUrl("marketing-hero");

// One size and box model for both buttons, so they sit on the same line.
const BUTTON =
	"inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-base font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const QUIET =
	"rounded-sm font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 hover:decoration-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function WalkthroughDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={`${HOME_FONT_CLASS} gap-0 overflow-hidden bg-zinc-950 p-0 sm:max-w-5xl [&>button]:text-white`}
			>
				<DialogTitle className="sr-only">Elmo product walkthrough</DialogTitle>
				{/* Mounted only while open, so the player's script and poster cost nothing up front. */}
				{open ? (
					<Suspense fallback={<div className="aspect-video w-full" />}>
						<MuxPlayer
							playbackId="PYV9FNIG008vlkchyQf9KMTxDt028zQdshaM4VLC6lS1Q"
							streamType="on-demand"
							// Mux Data otherwise writes a `muxData` cookie on page load — before
							// anyone has answered the consent banner. Playback QoE still reports;
							// only cross-visit viewer recognition goes away.
							disableCookies
							accentColor="#2563eb"
							poster="/demo-poster.png"
							autoPlay
							metadata={{
								video_id: "KGvs37kE02Z6mnTpcrnLJCtiS01V023aJEHK3MZlmaULPA",
								video_title: "Elmo demo",
							}}
							style={{ aspectRatio: "16 / 9", display: "block", width: "100%" }}
						/>
					</Suspense>
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
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 md:px-6 md:pt-20 lg:pb-28">
				<div className="mx-auto flex max-w-3xl flex-col items-center text-center">
					<a
						href="https://github.com/elmohq/elmo"
						target="_blank"
						rel="noopener noreferrer"
						className="group inline-flex h-7 items-center gap-2 rounded-full bg-white/80 pl-1 pr-3 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300"
					>
						<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-zinc-100 px-2 font-mono text-[11px] font-normal text-zinc-700">
							<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
						</span>
						Open Source on GitHub
						<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
					</a>

					<h1 className="mt-8 text-[3.5rem] font-semibold leading-[0.95] tracking-[-0.045em] text-zinc-950 sm:text-7xl lg:text-[6.5rem]">
						Win AI Search
					</h1>
					<p className="mt-6 max-w-[60ch] text-pretty text-[17px]/7 text-zinc-600 md:text-xl/8">
						Elmo is the open-source AI visibility platform for AEO and GEO. See how ChatGPT, Claude, Gemini, and every
						other AI model talk about your brand, which sources they trust, and exactly what to do to get recommended.
					</p>
					<div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
						<a href={CLOUD_URL} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}>
							Get started
							<ArrowRight className="size-4" aria-hidden="true" />
						</a>
						<a
							href={DEMO_URL}
							target="_blank"
							rel={externalRel(DEMO_URL)}
							className={`${BUTTON} bg-white text-zinc-950 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300`}
						>
							Try the live demo
							<ArrowUpRight className="size-4" aria-hidden="true" />
						</a>
					</div>
					<p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-500">
						<Link {...SELF_HOST_LINK} className={QUIET}>
							Self-host for free
						</Link>
						<span aria-hidden="true" className="text-zinc-300">
							·
						</span>
						<button
							type="button"
							onClick={() => setVideoOpen(true)}
							className={`${QUIET} inline-flex items-center gap-1.5`}
						>
							<Play className="size-3 fill-current" aria-hidden="true" />
							Watch the walkthrough
						</button>
					</p>
				</div>

				<div className="mt-16 md:mt-20">
					<ProductDemo />
				</div>
			</div>
			<WalkthroughDialog open={videoOpen} onOpenChange={setVideoOpen} />
		</section>
	);
}
