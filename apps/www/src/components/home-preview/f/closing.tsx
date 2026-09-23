import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { bookDemoUrl } from "@workspace/config/referrals";
import { ArrowUpRight } from "lucide-react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { QuickstartBlock } from "@/components/quickstart-block";
import { externalRel } from "@/lib/external-link";
import { Eyebrow } from "./ui";

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
		<section className="relative overflow-hidden border-t border-zinc-200 bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_50%_55%_at_25%_45%,black,transparent)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-[5%] top-1/2 h-[300px] w-[620px] -translate-y-1/2 rounded-full bg-blue-500/10 blur-[110px]"
			/>
			<div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-12 lg:items-center lg:gap-16 lg:py-28">
				<div className="lg:col-span-7">
					<Eyebrow>Get started</Eyebrow>
					<h2 className="mt-4 max-w-[16ch] text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance text-zinc-950 md:text-[3.5rem]">
						Start winning the answer.
					</h2>
					<p className="mt-5 max-w-[50ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
						Sign up for the cloud and we run everything for you from ${CLOUD_ENTRY_PRICE_USD}/mo, or run the same
						open-source product on your own infra for free.
					</p>
					<div className="mt-8 flex flex-wrap items-center gap-2.5 [&>a]:h-9 [&>a]:px-4">
						<CloudSignupCTA />
						<SelfHostCTA />
					</div>
					<p className="mt-5 text-sm text-zinc-500">
						Would you rather be shown around?{" "}
						<a
							href={DEMO_URL}
							target="_blank"
							rel={externalRel(DEMO_URL)}
							className="font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800"
						>
							Book a 30-minute demo
						</a>
						.
					</p>
				</div>

				<div className="flex flex-col gap-3 lg:col-span-5">
					<div className="shadow-[0_24px_48px_-16px_rgb(24_24_27/0.35)] [&>div]:rounded-xl">
						<QuickstartBlock />
					</div>
					<a
						href={DISCORD_INVITE_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="group flex items-center gap-4 rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)] transition hover:shadow-[0_0_0_1px_rgb(88_101_242/0.4),0_8px_24px_-12px_rgb(88_101_242/0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
					>
						<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#5865F2] text-white">
							<DiscordIcon className="size-5" />
						</span>
						<span className="min-w-0 flex-1">
							<span className="block text-sm font-medium text-zinc-950">Join the community on Discord</span>
							<span className="block text-sm text-zinc-600">Get help straight from the maintainers.</span>
						</span>
						<ArrowUpRight
							className="size-4 shrink-0 text-zinc-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-950"
							aria-hidden="true"
						/>
					</a>
				</div>
			</div>
		</section>
	);
}
