import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD, MONEY_BACK_GUARANTEE_DAYS } from "@workspace/config/plans";
import { demoSiteUrl } from "@workspace/config/referrals";
import { CUSTOMER_QUOTES } from "@workspace/ui/brand/customers";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { ArrowUpRight } from "lucide-react";
import { CloudSignupCTA, QuietCTA, SelfHostCTA } from "./cta-buttons";
import { CustomerLogosInline } from "./customer-logos";

const LIVE_DEMO_URL = demoSiteUrl("marketing-hero");

function DemoVideo() {
	return (
		<div className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg shadow-blue-600/10">
			<MuxPlayer
				playbackId="PYV9FNIG008vlkchyQf9KMTxDt028zQdshaM4VLC6lS1Q"
				streamType="on-demand"
				accentColor="#2563eb"
				poster="/demo-poster.png"
				metadata={{
					video_id: "KGvs37kE02Z6mnTpcrnLJCtiS01V023aJEHK3MZlmaULPA",
					video_title: "Elmo demo",
				}}
				style={{
					aspectRatio: "16 / 9",
					display: "block",
					width: "100%",
					cursor: "pointer",
				}}
			/>
		</div>
	);
}

/**
 * The rating and the shortest customer line, on one row under the buttons:
 * the moment someone is deciding whether to click is the moment a third party
 * vouching for the price is worth the most.
 */
function HeroProof() {
	const { quote, author, company, companyUrl, mark } = CUSTOMER_QUOTES.speakeasy;
	return (
		<figure className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			<G2Stars />
			<blockquote className="text-zinc-700">“{quote}”</blockquote>
			<figcaption className="flex items-center gap-1.5 text-zinc-500">
				<span>{author} at</span>
				<a
					href={companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={company}
					className="inline-flex items-center text-zinc-950 transition-opacity hover:opacity-80"
				>
					{mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function Hero() {
	return (
		<section className="relative border-b border-zinc-200 bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
			/>
			<div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 md:px-6 lg:pb-24 lg:pt-24">
				<div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
					<div className="lg:col-span-7">
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-mono text-[11px] text-zinc-700">
								<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
							</span>
							<a
								href="https://github.com/elmohq/elmo"
								target="_blank"
								rel="noopener noreferrer"
								className="group inline-flex items-center gap-1 font-mono text-[11px] text-zinc-600 hover:text-zinc-950"
							>
								Star on GitHub
								<ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
							</a>
						</div>
						<h1 className="mt-7 max-w-[16ch] text-5xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 sm:text-6xl lg:text-[4.25rem] lg:leading-[1.0]">
							Your brand, according to ChatGPT.
						</h1>
						<p className="mt-6 max-w-[58ch] text-pretty text-base text-zinc-600 md:text-lg">
							Elmo records what ChatGPT, Perplexity, Gemini, Claude, and Google AI Overviews say about you: every
							mention, every citation, every competitor named instead, tracked daily. It's open source, so run it in our
							cloud or on your own servers and keep the data either way.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-2">
							<CloudSignupCTA source="marketing-hero" />
							<SelfHostCTA source="marketing-hero" />
							<QuietCTA href={LIVE_DEMO_URL} source="marketing-hero" destination="live-demo">
								Live demo
							</QuietCTA>
						</div>
						<p className="mt-3 text-sm text-zinc-500">
							Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo, cancel anytime, {MONEY_BACK_GUARANTEE_DAYS}-day money-back
							guarantee. Self-hosting is free forever.
						</p>
						<HeroProof />
						<CustomerLogosInline />
					</div>
					<aside className="lg:col-span-5">
						<DemoVideo />
					</aside>
				</div>
			</div>
		</section>
	);
}
