import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowRight, Play } from "lucide-react";
import { CustomerLogosInline } from "./customer-logos";
import { QuickstartBlock } from "./quickstart-block";

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
	const cls = `inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium leading-none text-white ring-1 ring-blue-600 hover:bg-blue-700 ${className}`;
	if (to) {
		return (
			<Link to={to} className={cls}>
				{children}
			</Link>
		);
	}
	if (href) {
		return (
			<a
				href={href}
				className={cls}
				{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
			>
				{children}
			</a>
		);
	}
	return null;
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
	const cls = `inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-medium leading-none text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300 ${className}`;
	if (to) {
		return (
			<Link to={to} className={cls}>
				{children}
			</Link>
		);
	}
	if (href) {
		return (
			<a
				href={href}
				className={cls}
				{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
			>
				{children}
			</a>
		);
	}
	return null;
}

function VideoPlaceholder() {
	return (
		<div className="group relative aspect-[16/10] w-full overflow-hidden rounded-md border border-zinc-200 bg-zinc-950 shadow-lg shadow-blue-600/10">
			<img
				src="/screenshots/overview.png"
				alt=""
				className="size-full object-cover object-left-top opacity-50"
			/>
			<div
				aria-hidden="true"
				className="absolute inset-0 bg-linear-to-b from-zinc-950/40 via-zinc-950/30 to-zinc-950/70"
			/>
			<button
				type="button"
				aria-label="Play demo"
				className="absolute inset-0 flex items-center justify-center"
			>
				<span className="flex size-12 items-center justify-center rounded-full bg-white/95 shadow-xl ring-1 ring-zinc-200 backdrop-blur transition-transform duration-300 group-hover:scale-110">
					<Play
						className="ml-0.5 size-4 fill-zinc-950 text-zinc-950"
						strokeWidth={0}
					/>
				</span>
			</button>
			<div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-white/80">
				<span className="size-1 rounded-full bg-amber-400" />
				Demo · 2 min
			</div>
			<div className="absolute bottom-2.5 right-3 font-mono text-[9px] uppercase tracking-[0.2em] text-white/60">
				Coming soon
			</div>
		</div>
	);
}

export function Hero() {
	return (
		<section className="relative border-b border-zinc-200 bg-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(0_0_0/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.04)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
			/>
			<div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 md:px-6 lg:pb-24 lg:pt-24">
				<div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
					<div className="lg:col-span-7">
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-mono text-[11px] text-zinc-700">
								<span className="size-1.5 rounded-full bg-emerald-500" />
								v0.2.6
							</span>
							<a
								href="https://github.com/elmohq/elmo"
								target="_blank"
								rel="noopener noreferrer"
								className="group inline-flex items-center gap-1 font-mono text-[11px] text-zinc-600 hover:text-zinc-950"
							>
								Star on GitHub
								<ArrowUpRight className="size-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
							</a>
						</div>
						<h1 className="mt-7 max-w-[18ch] text-5xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 sm:text-6xl lg:text-[4.25rem] lg:leading-[1.0]">
							Know How AI Talks About Your Brand
						</h1>
						<p className="mt-6 max-w-[58ch] text-pretty text-base text-zinc-600 md:text-lg">
							Track your brand's visibility across any AI model. Monitor
							mentions, analyze citations, and benchmark competitors. Open
							source and self-hosted, so your data stays yours and you'll never
							get locked in.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-2">
							<PrimaryCTA to="/docs">
								Get Started
								<ArrowRight className="size-3.5" />
							</PrimaryCTA>
							<GhostCTA href="https://demo.elmohq.com" external>
								Live demo
								<ArrowUpRight className="size-3.5" />
							</GhostCTA>
						</div>
						<CustomerLogosInline />
					</div>
					{/* When restoring <VideoPlaceholder />, drop lg:self-center so the column tops align again. */}
					<aside className="flex flex-col gap-4 lg:col-span-5 lg:self-center">
						<QuickstartBlock />
						{/* <VideoPlaceholder /> */}
					</aside>
				</div>
			</div>
		</section>
	);
}
