import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { bookDemoUrl, demoSiteUrl } from "@workspace/config/referrals";
import { QuickstartBlock } from "@/components/quickstart-block";
import { externalRel } from "@/lib/external-link";
import { CtaPair } from "./cta";

export const DISCORD_INVITE_URL = "https://discord.gg/s24nubCtKz";
const BOOK_URL = bookDemoUrl("marketing-cta");
const LIVE_DEMO_URL = demoSiteUrl("marketing-closing");
const QUIET = "font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800";

/** Final call to action, with the self-host quickstart beside it. */
export function Closing() {
	return (
		<section className="relative overflow-hidden border-t border-zinc-200/80 bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_70%_at_20%_50%,rgb(219_234_254/0.8),transparent_75%)]"
			/>
			<div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-12 lg:items-center lg:gap-16 lg:py-28">
				<div className="lg:col-span-7">
					<h2 className="max-w-[16ch] text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance text-zinc-950 md:text-[3.5rem]">
						Start winning AI search today.
					</h2>
					<p className="mt-5 max-w-[50ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
						Sign up for the cloud and we run everything for you from ${CLOUD_ENTRY_PRICE_USD}/mo, or run the same
						open-source product on your own infra for free.
					</p>
					<CtaPair size="lg" className="mt-8 justify-start" from="marketing-closing" />
					<p className="mt-5 text-sm text-zinc-500">
						Rather look around first? Try the{" "}
						<a href={LIVE_DEMO_URL} target="_blank" rel={externalRel(LIVE_DEMO_URL)} className={QUIET}>
							live demo
						</a>{" "}
						or{" "}
						<a href={BOOK_URL} target="_blank" rel={externalRel(BOOK_URL)} className={QUIET}>
							book a 30-minute tour
						</a>
						.
					</p>
				</div>

				<div className="flex flex-col gap-3 lg:col-span-5">
					<div className="[&>div]:rounded-xl">
						<QuickstartBlock />
					</div>
				</div>
			</div>
		</section>
	);
}
