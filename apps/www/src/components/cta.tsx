import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { bookDemoUrl } from "@workspace/config/referrals";
import { externalRel } from "@/lib/external-link";
import { CloudSignupCTA, QuietCTA, SelfHostCTA } from "./cta-buttons";
import { QuickstartBlock } from "./quickstart-block";

const DEMO_URL = bookDemoUrl("marketing-cta");

export function CTA() {
	return (
		<section className="relative border-b border-zinc-200 bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_top,black,transparent_85%)]"
			/>
			<div className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<div className="grid items-center gap-10 lg:grid-cols-12">
					<div className="lg:col-span-7">
						<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ GET STARTED</p>
						<h2 className="mt-4 max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
							Start tracking AI answers today.
						</h2>
						<p className="mt-5 max-w-[52ch] text-pretty text-zinc-600 md:text-lg">
							Sign up for the cloud and we run everything for you from ${CLOUD_ENTRY_PRICE_USD}/mo: hosting, updates, no
							deployment. Or run the same open-source product on your own infra for free.
						</p>
						<div className="mt-7 flex flex-wrap items-center gap-2">
							<CloudSignupCTA />
							<SelfHostCTA />
							<QuietCTA href="https://github.com/elmohq/elmo">View source</QuietCTA>
						</div>
						{/* A fourth button would flatten the three above it, so the call
						    that suits someone still deciding is offered as a sentence. */}
						<p className="mt-4 text-sm text-zinc-500">
							Would you rather be shown around?{" "}
							<a
								href={DEMO_URL}
								target="_blank"
								rel={externalRel(DEMO_URL)}
								className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
							>
								Book a 30-minute demo
							</a>
							.
						</p>
					</div>
					<div className="lg:col-span-5">
						<QuickstartBlock />
					</div>
				</div>
			</div>
		</section>
	);
}
