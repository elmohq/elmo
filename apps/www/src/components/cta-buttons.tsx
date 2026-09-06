import { Link } from "@tanstack/react-router";
import { CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { externalRel } from "@/lib/external-link";

const PRIMARY_CLS =
	"inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium leading-none text-white ring-1 ring-blue-600 hover:bg-blue-700";
const GHOST_CLS =
	"inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium leading-none text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300";

function Anchor({
	to,
	href,
	external,
	cls,
	children,
}: {
	to?: string;
	href?: string;
	external?: boolean;
	cls: string;
	children: React.ReactNode;
}) {
	if (to) {
		return (
			<Link to={to} className={cls}>
				{children}
			</Link>
		);
	}
	if (href) {
		return (
			<a href={href} className={cls} {...(external ? { target: "_blank", rel: externalRel(href) } : {})}>
				{children}
			</a>
		);
	}
	return null;
}

function PrimaryCTA({
	to,
	href,
	external,
	children,
	className = "",
}: {
	to?: string;
	href?: string;
	external?: boolean;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<Anchor to={to} href={href} external={external} cls={`${PRIMARY_CLS} ${className}`}>
			{children}
		</Anchor>
	);
}

function GhostCTA({
	to,
	href,
	external,
	children,
	className = "",
}: {
	to?: string;
	href?: string;
	external?: boolean;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<Anchor to={to} href={href} external={external} cls={`${GHOST_CLS} ${className}`}>
			{children}
		</Anchor>
	);
}

/**
 * The two halves of every call to action on the site, in this order: cloud is
 * what we sell, self-hosting is what makes it trustworthy. Signup opens in the
 * same tab — a conversion click should navigate, not spawn a background tab.
 */
export function CloudSignupCTA({ label = "Start with Cloud" }: { label?: string }) {
	return (
		<PrimaryCTA href={CLOUD_SIGNUP_URL}>
			{label}
			<ArrowRight className="size-3.5" />
		</PrimaryCTA>
	);
}

export function SelfHostCTA({ label = "Self-host free" }: { label?: string }) {
	return <GhostCTA to="/docs">{label}</GhostCTA>;
}

/** Third-tier link for the option that supports a CTA without competing with it. */
export function QuietCTA({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel={externalRel(href)}
			className="group inline-flex items-center gap-1 px-1 text-sm font-medium text-zinc-600 hover:text-zinc-950"
		>
			{children}
			<ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
		</a>
	);
}
