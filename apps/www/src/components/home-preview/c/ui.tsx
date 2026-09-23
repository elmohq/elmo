import { Link } from "@tanstack/react-router";
import { CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { externalRel } from "@/lib/external-link";

const FOCUS =
	"outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

export const PRIMARY_BTN = `inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-medium leading-none text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_0_1px_rgb(37_99_235),0_8px_24px_-8px_rgb(37_99_235/0.7)] transition-colors hover:bg-blue-500 ${FOCUS}`;
export const SECONDARY_BTN = `inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-white/[0.04] px-4 text-sm font-medium leading-none text-zinc-100 ring-1 ring-white/15 transition-colors hover:bg-white/[0.08] hover:ring-white/25 ${FOCUS}`;
export const FOCUS_RING = FOCUS;

export function CloudCTA({ label = "Start with Cloud", className = "" }: { label?: string; className?: string }) {
	return (
		<a href={CLOUD_SIGNUP_URL} className={`${PRIMARY_BTN} ${className}`}>
			{label}
			<ArrowRight className="size-4" aria-hidden="true" />
		</a>
	);
}

export function SelfHostCTA({ label = "Self-host free", className = "" }: { label?: string; className?: string }) {
	return (
		<Link to="/docs" className={`${SECONDARY_BTN} ${className}`}>
			{label}
		</Link>
	);
}

export function QuietLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel={externalRel(href)}
			className={`group inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white ${FOCUS}`}
		>
			{children}
			<ArrowUpRight
				className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
	);
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return (
		<p className={`font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500 ${className}`}>
			<span className="text-blue-400">{"//"}</span> {children}
		</p>
	);
}

export function SectionHeading({
	eyebrow,
	title,
	lede,
	id,
	className = "",
}: {
	eyebrow: string;
	title: React.ReactNode;
	lede?: React.ReactNode;
	id?: string;
	className?: string;
}) {
	return (
		<div className={className}>
			<Eyebrow>{eyebrow}</Eyebrow>
			<h2
				id={id}
				className="mt-4 max-w-[24ch] text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.03em] text-white md:text-[2.75rem]"
			>
				{title}
			</h2>
			{lede ? <p className="mt-4 max-w-[56ch] text-pretty text-base/7 text-zinc-400 md:text-lg/8">{lede}</p> : null}
		</div>
	);
}

/** A light product screenshot sat in a dark chrome, so it reads as a window rather than a white hole. */
export function ScreenFrame({
	src,
	alt,
	label,
	priority = false,
	glow = false,
	className = "",
}: {
	src: string;
	alt: string;
	label?: string;
	priority?: boolean;
	glow?: boolean;
	className?: string;
}) {
	return (
		<div className={`relative ${className}`}>
			{glow ? (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 rounded-[2rem] bg-[radial-gradient(50%_60%_at_50%_0%,rgb(37_99_235/0.35),transparent_70%)] blur-2xl"
				/>
			) : null}
			<div
				className={`relative rounded-xl p-px ${glow ? "bg-gradient-to-b from-blue-400/60 via-white/15 to-white/5" : "bg-white/10"}`}
			>
				<div className="overflow-hidden rounded-[11px] bg-zinc-900">
					<div className="flex h-8 items-center gap-3 border-b border-white/10 px-3">
						<div className="flex gap-1.5" aria-hidden="true">
							<span className="size-2.5 rounded-full bg-white/15" />
							<span className="size-2.5 rounded-full bg-white/15" />
							<span className="size-2.5 rounded-full bg-white/15" />
						</div>
						{label ? (
							<span className="mx-auto truncate rounded bg-white/[0.04] px-3 py-0.5 font-mono text-[10px] text-zinc-400 ring-1 ring-white/5">
								{label}
							</span>
						) : null}
						<span className="w-[42px]" aria-hidden="true" />
					</div>
					<img
						src={src}
						alt={alt}
						width={3000}
						height={1800}
						loading={priority ? "eager" : "lazy"}
						decoding="async"
						className="block aspect-[5/3] w-full object-cover object-left-top"
					/>
				</div>
			</div>
		</div>
	);
}
