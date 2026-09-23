import { Link } from "@tanstack/react-router";
import { CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { externalRel } from "@/lib/external-link";

export const DEMO_URL = "https://demo.elmohq.com";
export const DISCORD_URL = "https://discord.gg/s24nubCtKz";
export const GITHUB_URL = "https://github.com/elmohq/elmo";

const BTN_BASE =
	"group/btn inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold leading-none transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2";

export const BTN_PRIMARY = `${BTN_BASE} bg-blue-600 text-white shadow-[0_3px_0_0_#1e3a8a] hover:bg-blue-700 hover:shadow-[0_5px_0_0_#1e3a8a] active:shadow-[0_1px_0_0_#1e3a8a] focus-visible:outline-blue-600`;
export const BTN_SECONDARY = `${BTN_BASE} bg-white text-zinc-950 ring-2 ring-zinc-950 shadow-[0_3px_0_0_#09090b] hover:shadow-[0_5px_0_0_#09090b] active:shadow-[0_1px_0_0_#09090b] focus-visible:outline-zinc-950`;
export const BTN_ON_BLUE = `${BTN_BASE} bg-white text-blue-700 shadow-[0_3px_0_0_#1e3a8a] hover:bg-blue-50 hover:shadow-[0_5px_0_0_#1e3a8a] active:shadow-[0_1px_0_0_#1e3a8a] focus-visible:outline-white`;
export const BTN_GHOST_ON_BLUE = `${BTN_BASE} text-white ring-2 ring-white/70 hover:bg-white/10 hover:ring-white focus-visible:outline-white`;

export function CloudButton({
	label = "Start with Cloud",
	className = BTN_PRIMARY,
}: {
	label?: string;
	className?: string;
}) {
	return (
		<a href={CLOUD_SIGNUP_URL} className={className}>
			{label}
			<ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
		</a>
	);
}

export function SelfHostButton({
	label = "Self-host free",
	className = BTN_SECONDARY,
}: {
	label?: string;
	className?: string;
}) {
	return (
		<Link to="/docs" className={className}>
			{label}
		</Link>
	);
}

export function TextLink({
	href,
	children,
	className = "text-zinc-700 hover:text-zinc-950",
}: {
	href: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel={externalRel(href)}
			className={`group/tl inline-flex items-center gap-1 rounded-md px-1 text-[15px] font-semibold underline decoration-2 underline-offset-4 decoration-current/25 hover:decoration-current ${className}`}
		>
			{children}
			<ArrowUpRight
				className="size-4 transition-transform group-hover/tl:-translate-y-0.5 group-hover/tl:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
	);
}

export function Eyebrow({ children, className = "text-blue-600" }: { children: React.ReactNode; className?: string }) {
	return <p className={`text-sm font-bold uppercase tracking-[0.14em] ${className}`}>{children}</p>;
}

/** Display face for section headlines — the same Titan One as the wordmark. */
export const DISPLAY = "font-titan-one font-normal tracking-[-0.01em] text-balance";

const SCREENSHOT_WIDTHS = [750, 1200, 1920];

function optimizedSrc(src: string, width: number) {
	const params = new URLSearchParams({ url: src, w: String(width), q: "75" });
	return `/_vercel/image?${params.toString()}`;
}

/**
 * A real product screenshot. `crop` hides the app sidebar so a card shows the
 * page content rather than navigation; "zoom" also enlarges it so the left of
 * the page stays legible in a small card.
 */
export function Shot({
	src,
	alt,
	aspect = "aspect-[5/3]",
	crop,
	sizes = "(min-width: 1024px) 720px, 100vw",
	eager = false,
}: {
	src: string;
	alt: string;
	aspect?: string;
	crop?: "sidebar" | "zoom";
	sizes?: string;
	eager?: boolean;
}) {
	const optimized = import.meta.env.PROD;
	return (
		<div className={`relative w-full overflow-hidden bg-white ${aspect}`}>
			<img
				src={optimized ? optimizedSrc(src, 1200) : src}
				srcSet={optimized ? SCREENSHOT_WIDTHS.map((w) => `${optimizedSrc(src, w)} ${w}w`).join(", ") : undefined}
				sizes={sizes}
				alt={alt}
				width={3000}
				height={1800}
				loading={eager ? "eager" : "lazy"}
				decoding="async"
				className={
					crop === "zoom"
						? "absolute top-0 left-[-28%] block h-auto w-[165%] max-w-none"
						: crop === "sidebar"
							? "absolute top-0 left-[-21%] block h-auto w-[121%] max-w-none"
							: "absolute inset-0 block size-full object-cover object-left-top"
				}
			/>
		</div>
	);
}
