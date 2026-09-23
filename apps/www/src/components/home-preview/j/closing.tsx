import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { bookDemoUrl } from "@workspace/config/referrals";
import { ArrowUpRight } from "lucide-react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { QuickstartBlock } from "@/components/quickstart-block";
import { externalRel } from "@/lib/external-link";
import { SpecLabel } from "./ui";

export const DISCORD_INVITE_URL = "https://discord.gg/s24nubCtKz";
const DEMO_URL = bookDemoUrl("marketing-cta");

function DiscordIcon({ className = "" }: { className?: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className={`fill-current ${className}`}>
			<path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
		</svg>
	);
}

/** Final call to action, with the self-host quickstart and the community folded in beside it. */
export function Closing() {
	return (
		<section className="border-t border-[#1c1a17]/12">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SpecLabel n="§ 06">Get started</SpecLabel>
				<div className="mt-10 grid gap-12 lg:grid-cols-12 lg:items-end lg:gap-16">
					<div className="lg:col-span-7">
						<h2 className="max-w-[14ch] text-[2.75rem] font-semibold leading-[1] tracking-[-0.04em] text-balance text-[#1c1a17] md:text-[4rem]">
							Measure it. Then <span className="text-blue-600">check our work.</span>
						</h2>
						<p className="mt-6 max-w-[50ch] text-pretty text-base/7 text-stone-700 md:text-lg/8">
							Start on Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo and we run everything, or run the same open-source product
							on your own servers for free.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-2.5 [&>a]:h-10 [&>a]:px-4 [&>a]:text-[15px]">
							<CloudSignupCTA />
							<SelfHostCTA />
						</div>
						<p className="mt-5 text-sm text-stone-600">
							Would you rather be shown around?{" "}
							<a
								href={DEMO_URL}
								target="_blank"
								rel={externalRel(DEMO_URL)}
								className="rounded-sm font-medium text-[#1c1a17] underline decoration-stone-300 underline-offset-4 hover:decoration-[#1c1a17] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
							>
								Book a 30-minute demo
							</a>
							.
						</p>
					</div>

					<div className="flex flex-col gap-3 lg:col-span-5">
						<p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-stone-600">
							Self-host in two commands
						</p>
						<div className="[&>div]:rounded-lg [&>div]:border-[#1c1a17] [&>div]:bg-[#1c1a17]">
							<QuickstartBlock />
						</div>
						<a
							href={DISCORD_INVITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="group flex items-center gap-4 rounded-lg bg-white p-4 ring-1 ring-[#1c1a17]/15 transition hover:ring-[#5865F2]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-[#5865F2] text-white">
								<DiscordIcon className="size-5" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-sm font-medium text-[#1c1a17]">Join the community on Discord</span>
								<span className="block text-sm text-stone-600">Get help straight from the maintainers.</span>
							</span>
							<ArrowUpRight
								className="size-4 shrink-0 text-stone-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#1c1a17]"
								aria-hidden="true"
							/>
						</a>
					</div>
				</div>
			</div>
		</section>
	);
}
