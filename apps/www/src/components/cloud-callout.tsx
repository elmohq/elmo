import { CLOUD_ENTRY_PRICE_USD, MONEY_BACK_GUARANTEE_DAYS } from "@workspace/config/plans";
import { CloudSignupCTA, SelfHostCTA } from "./cta-buttons";

type Variant = "docs" | "blog";

/**
 * The cloud offer, placed where a reader is most likely to want it. In the
 * docs that is the point where self-hosting starts to look like work (API
 * keys, scraper accounts); on the blog it is the end of a post that just
 * explained why any of this matters. Available to MDX as <CloudCallout />.
 */
export function CloudCallout({ variant = "docs" }: { variant?: Variant }) {
	const source = variant === "blog" ? "marketing-blog" : "marketing-docs";
	const heading = variant === "blog" ? "Track how AI answers talk about your brand" : "Don't want to self-host?";
	const body =
		variant === "blog"
			? `Elmo is open source. Run it in our cloud from $${CLOUD_ENTRY_PRICE_USD}/mo with a ${MONEY_BACK_GUARANTEE_DAYS}-day money-back guarantee, or self-host it for free.`
			: `Elmo Cloud runs this same product for you from $${CLOUD_ENTRY_PRICE_USD}/mo, with a ${MONEY_BACK_GUARANTEE_DAYS}-day money-back guarantee. No Docker, no API keys, no scraper accounts.`;

	return (
		<aside className="not-prose my-8 rounded-md border border-blue-200 bg-blue-50/40 p-6">
			<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-blue-600">/ Elmo Cloud</p>
			<h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">{heading}</h2>
			<p className="mt-2 max-w-[60ch] text-pretty text-sm leading-relaxed text-zinc-600">{body}</p>
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<CloudSignupCTA source={source} />
				{variant === "blog" && <SelfHostCTA source={source} />}
			</div>
		</aside>
	);
}
