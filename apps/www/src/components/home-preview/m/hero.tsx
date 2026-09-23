import { useLoaderData } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { ArrowUpRight, Check, Copy, Star } from "lucide-react";
import { useState } from "react";
import { CloudSignupCTA } from "@/components/cta-buttons";
import { formatStarCount } from "@/lib/github-stars";
import { OwnershipConsole } from "./console";
import { SelfHostDarkCTA } from "./ui";

export const HERO_ID = "hero-m";
const DEMO_URL = "https://demo.elmohq.com";
const INSTALL = "npm install -g @elmohq/cli && elmo init";

function InstallChip() {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(INSTALL);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard can be unavailable (permissions, insecure origin); the command stays selectable.
		}
	};
	return (
		<div className="inline-flex h-9 max-w-full items-center gap-3 rounded-lg bg-white/[0.04] pl-3 pr-1 font-mono text-[11.5px] text-zinc-300 sm:pl-3.5 sm:text-[12.5px] ring-1 ring-white/10">
			<span className="min-w-0 truncate">
				<span className="select-none text-zinc-600">$ </span>npm install -g{" "}
				<span className="text-blue-300">@elmohq/cli</span>
				<span className="text-zinc-600"> &amp;&amp; </span>elmo init
			</span>
			<button
				type="button"
				onClick={copy}
				aria-label={copied ? "Copied" : "Copy install command"}
				className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-400"
			>
				{copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
			</button>
		</div>
	);
}

function GitHubMark({ className = "" }: { className?: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className={`fill-current ${className}`}>
			<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
		</svg>
	);
}

export function Hero() {
	const rootData = useLoaderData({ from: "__root__" });
	const stars = rootData?.githubStars ?? 0;

	return (
		<section className="relative bg-white">
			{/* The dark band stops partway down the console, so the console bridges into the light page. */}
			<div
				id={HERO_ID}
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 -top-14 bottom-40 overflow-hidden bg-[#050915] sm:bottom-56"
			>
				<div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(37_99_235/0.28),transparent_70%)]" />
				<div className="absolute left-1/2 top-[43rem] size-[2400px] -translate-x-1/2 rounded-full bg-[#050915] shadow-[0_-1px_0_rgb(147_197_253/0.28),0_-40px_120px_-20px_rgb(37_99_235/0.45)] max-sm:top-[51rem] max-sm:size-[1400px]" />
				<div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />
			</div>

			<div className="relative mx-auto max-w-6xl px-4 pt-14 md:px-6 md:pt-20">
				<div className="mx-auto flex max-w-4xl flex-col items-center text-center">
					<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-2 rounded-full bg-white/[0.04] pl-1 pr-3 text-xs text-zinc-300 ring-1 ring-white/10 transition hover:text-white hover:ring-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
						>
							<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-white/[0.07] px-2 font-mono text-[11px] text-zinc-200">
								<span className="size-1.5 rounded-full bg-emerald-400" />v{__APP_VERSION__}
							</span>
							MIT licensed, on GitHub
							<ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</a>
						<G2Stars />
					</div>

					<h1 className="mt-8 text-sm font-medium text-blue-300 md:text-[15px]">
						Open-source AI visibility tracking for ChatGPT, Claude, Gemini, Perplexity &amp; Google AI&nbsp;Overviews
					</h1>
					<p className="mt-4 text-balance text-[2.625rem] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.5rem]">
						The AI visibility platform you can{" "}
						<span className="bg-gradient-to-r from-blue-400 via-sky-300 to-blue-200 bg-clip-text text-transparent">
							read, run, and&nbsp;own.
						</span>
					</p>
					<p className="mt-6 max-w-[60ch] text-pretty text-base/7 text-zinc-400 md:text-lg/8">
						See how AI answers mention, rank, and cite your brand against competitors. The code is MIT-licensed, your
						data comes out over a REST API and MCP on every plan, and it runs in our cloud or on your own servers.
					</p>

					<div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 [&>a]:h-10 [&>a]:px-5">
						<CloudSignupCTA />
						<SelfHostDarkCTA />
					</div>
					<ul className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-zinc-500 [&>li]:inline-flex [&>li]:items-center [&>li]:gap-1.5">
						<li>
							<Check className="size-3.5 text-blue-400" aria-hidden="true" />
							Cloud from <span className="text-zinc-300">${CLOUD_ENTRY_PRICE_USD}/mo</span>
						</li>
						<li>
							<Check className="size-3.5 text-blue-400" aria-hidden="true" />
							Self-host free forever
						</li>
						<li>
							<Check className="size-3.5 text-blue-400" aria-hidden="true" />
							Unlimited seats
						</li>
					</ul>

					<div className="mt-8 flex w-full flex-wrap items-center justify-center gap-2.5">
						<InstallChip />
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Star Elmo on GitHub${stars ? `, ${stars} stars` : ""}`}
							className="group inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.04] px-3 text-[13px] font-medium text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
						>
							<GitHubMark className="size-3.5" />
							elmohq/elmo
							{stars > 0 ? (
								<span className="inline-flex items-center gap-1 border-l border-white/10 pl-2 font-mono text-xs tabular-nums text-zinc-300 group-hover:text-amber-300">
									<Star className="size-3 fill-current" aria-hidden="true" />
									{formatStarCount(stars)}
								</span>
							) : null}
						</a>
					</div>
				</div>

				<div className="relative mx-auto mt-14 max-w-[68rem] md:mt-16">
					<OwnershipConsole />
					<p className="mt-4 text-center text-[13px] text-zinc-500">
						Rather click around a real instance?{" "}
						<a
							href={DEMO_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800"
						>
							Open the live demo
						</a>
						, no signup.
					</p>
				</div>
			</div>
		</section>
	);
}
