import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { bookDemoUrl, cloudAppUrl, demoSiteUrl, type ReferralSource } from "@workspace/config/referrals";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { externalRel } from "@/lib/external-link";

export const DISCORD_INVITE_URL = "https://discord.gg/s24nubCtKz";
const BOOK_URL = bookDemoUrl("marketing-cta");

const INCLUDED = ["Self-serve", "Unlimited seats", "API and MCP access"];

const BUTTON =
	"inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-base font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const QUIET = "font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800";

/** The last push on the page is for the cloud; self-hosting has its own section above. */
/** `from` tags the sign-up and demo links so each page's closing band shows up separately in analytics. */
export function Closing({ from = "marketing-closing" }: { from?: ReferralSource }) {
	const cloudUrl = cloudAppUrl(from);
	const demoUrl = demoSiteUrl(from);
	return (
		<section className="relative overflow-hidden border-t border-zinc-200/80 bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_top,black,transparent_85%)]"
			/>
			<div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center md:px-6 lg:py-28">
				<h2 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance text-zinc-950 md:text-[3.5rem]">
					Start winning AI search today.
				</h2>
				<p className="mt-5 max-w-[52ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8">
					Start tracking your brand in minutes. Plans start at ${CLOUD_ENTRY_PRICE_USD}/mo.
				</p>
				<div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
					<a href={cloudUrl} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}>
						Get started
						<ArrowRight className="size-4" aria-hidden="true" />
					</a>
					<a
						href={demoUrl}
						target="_blank"
						rel={externalRel(demoUrl)}
						className={`${BUTTON} bg-white text-zinc-950 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300`}
					>
						Try the live demo
						<ArrowUpRight className="size-4" aria-hidden="true" />
					</a>
				</div>
				<ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-600">
					{INCLUDED.map((item) => (
						<li key={item} className="inline-flex items-center gap-1.5">
							<Check className="size-4 text-blue-600" strokeWidth={2.5} aria-hidden="true" />
							{item}
						</li>
					))}
				</ul>
				<p className="mt-8 text-sm text-zinc-500">
					Want a walkthrough first?{" "}
					<a href={BOOK_URL} target="_blank" rel={externalRel(BOOK_URL)} className={QUIET}>
						Book a 30-minute tour
					</a>
					.
				</p>
			</div>
		</section>
	);
}
