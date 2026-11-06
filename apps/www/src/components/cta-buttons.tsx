import { Link } from "@tanstack/react-router";
import { cloudAppUrl, type ReferralSource } from "@workspace/config/referrals";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { type CtaDestination, trackCta } from "@/lib/analytics";
import { externalRel } from "@/lib/external-link";
import { SELF_HOST_LINK } from "@/lib/self-host-link";

const PRIMARY_CLS =
	"inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium leading-none text-white ring-1 ring-blue-600 hover:bg-blue-700";
const GHOST_CLS =
	"inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium leading-none text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300";

/**
 * The two halves of every call to action on the site, in this order: cloud is
 * what we sell, self-hosting is what makes it trustworthy. Signup opens in the
 * same tab — a conversion click should navigate, not spawn a background tab.
 *
 * Every button names the surface it sits on as `from`. The signup link carries
 * it as `ref` so the app can attribute the account, and the click event carries
 * it so the funnel can be read per button rather than per site.
 */
export function CloudSignupCTA({
	from,
	label = "Start with Cloud",
	className = "",
}: {
	from: ReferralSource;
	label?: string;
	className?: string;
}) {
	return (
		<a
			href={cloudAppUrl(from)}
			onClick={() => trackCta("cloud-signup", from)}
			className={`${PRIMARY_CLS} ${className}`}
		>
			{label}
			<ArrowRight className="size-3.5" />
		</a>
	);
}

export function SelfHostCTA({
	from,
	label = "Self-host free",
	className = "",
}: {
	from: ReferralSource;
	label?: string;
	className?: string;
}) {
	return (
		<Link {...SELF_HOST_LINK} onClick={() => trackCta("self-host", from)} className={`${GHOST_CLS} ${className}`}>
			{label}
		</Link>
	);
}

/** Third-tier link for the option that supports a CTA without competing with it. */
export function QuietCTA({
	href,
	from,
	destination,
	children,
}: {
	href: string;
	from: ReferralSource;
	destination: CtaDestination;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel={externalRel(href)}
			onClick={() => trackCta(destination, from)}
			className="group inline-flex items-center gap-1 px-1 text-sm font-medium text-zinc-600 hover:text-zinc-950"
		>
			{children}
			<ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
		</a>
	);
}
