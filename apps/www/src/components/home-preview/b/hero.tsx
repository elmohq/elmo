import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { ArrowUpRight, Check, Link2 } from "lucide-react";
import { CustomerLogosInline } from "@/components/customer-logos";
import { CloudButton, DEMO_URL, DISPLAY, GITHUB_URL, SelfHostButton, TextLink } from "./ui";

function Squiggle() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 300 20"
			preserveAspectRatio="none"
			className="absolute -bottom-2 left-0 h-[0.28em] w-[calc(100%-0.35em)] text-amber-400 lg:-bottom-3"
		>
			<path
				d="M3 14 C 40 4, 70 4, 100 11 S 160 18, 200 9 S 265 3, 297 10"
				fill="none"
				stroke="currentColor"
				strokeWidth="7"
				strokeLinecap="round"
			/>
		</svg>
	);
}

const ENGINES = [
	{ id: "openai", name: "ChatGPT" },
	{ id: "anthropic", name: "Claude" },
	{ id: "perplexity", name: "Perplexity" },
];

const SOURCES = ["runnersworld.com", "runrepeat.com", "reddit.com"];

/**
 * A hand-drawn illustration of what Elmo inspects: one AI answer, with the
 * tracked brand picked out and the cited sources listed. It is labelled as an
 * example so nobody reads the chips as a measured result.
 */
function AnswerCard() {
	return (
		<figure className="relative isolate mx-auto w-full max-w-[520px]">
			<div className="relative">
				<div
					aria-hidden="true"
					className="absolute -inset-2 -z-10 rotate-2 rounded-[2rem] bg-blue-600 sm:-inset-4 lg:rotate-3"
				/>
				<div className="relative overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-20px_rgb(30_58_138/0.45)] ring-1 ring-zinc-950/10">
					<div className="flex items-center gap-1 overflow-hidden border-b border-zinc-100 px-3 pt-3">
						{ENGINES.map((e, i) => (
							<span
								key={e.id}
								className={`inline-flex shrink-0 items-center gap-1.5 rounded-t-lg px-2.5 py-2 text-xs font-semibold ${
									i === 0 ? "bg-zinc-100 text-zinc-950" : "text-zinc-400"
								}`}
							>
								<ModelIcon iconId={e.id} className="size-3.5" />
								{e.name}
							</span>
						))}
					</div>

					<div className="space-y-4 p-5 sm:p-6">
						<div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-sm text-zinc-900">
							What are the best running shoes for beginners?
						</div>

						<div className="space-y-3 text-[13.5px] leading-relaxed text-zinc-700 sm:text-sm">
							<p>For most new runners, a cushioned neutral trainer is the safest start. Popular picks:</p>
							<ol className="space-y-2">
								<li className="flex gap-2">
									<span className="font-semibold text-zinc-400">1.</span>
									<span>
										<strong className="font-semibold text-zinc-950">Brooks Ghost</strong> — soft, stable, and forgiving.
									</span>
								</li>
								<li className="flex gap-2">
									<span className="font-semibold text-zinc-400">2.</span>
									<span>
										<mark className="rounded-md bg-amber-200 px-1 py-0.5 font-semibold text-zinc-950 ring-2 ring-amber-300">
											Nike Pegasus
										</mark>{" "}
										— a versatile daily trainer that works for most paces.
									</span>
								</li>
								<li className="flex gap-2">
									<span className="font-semibold text-zinc-400">3.</span>
									<span>
										<strong className="font-semibold text-zinc-950">Hoka Clifton</strong> — max cushion for longer runs.
									</span>
								</li>
							</ol>
						</div>

						<div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-zinc-200 pt-4">
							<span className="mr-1 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">Sources</span>
							{SOURCES.map((s) => (
								<span
									key={s}
									className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600"
								>
									<Link2 className="size-3" aria-hidden="true" />
									{s}
								</span>
							))}
						</div>
					</div>
				</div>

				<div
					aria-hidden="true"
					className="absolute -top-5 right-3 flex rotate-3 items-center gap-2 rounded-2xl bg-zinc-950 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xl sm:right-5"
				>
					<span className="flex size-5 items-center justify-center rounded-full bg-emerald-400 text-zinc-950">
						<Check className="size-3.5" strokeWidth={3} />
					</span>
					You're mentioned #2
				</div>
				<div
					aria-hidden="true"
					className="absolute -bottom-5 left-4 flex -rotate-2 items-center gap-2 rounded-2xl bg-amber-300 px-3.5 py-2.5 text-sm font-semibold text-zinc-950 shadow-xl sm:left-6"
				>
					3 sources cited · 2 competitors
				</div>
			</div>
			<figcaption className="mt-12 text-center text-xs text-zinc-500">
				Illustration: what Elmo pulls out of every AI answer it tracks.
			</figcaption>
		</figure>
	);
}

export function HeroB() {
	return (
		<section className="relative overflow-hidden">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgb(24_24_27/0.08)_1px,transparent_1.5px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
			/>
			<div className="relative mx-auto max-w-6xl px-5 pt-12 pb-16 md:px-8 lg:pt-20 lg:pb-20">
				<div className="grid items-center gap-16 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
					<div>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
							<a
								href={GITHUB_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="group inline-flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-[13px] font-semibold text-zinc-800 shadow-sm ring-1 ring-zinc-950/10 transition hover:ring-zinc-950/25"
							>
								<span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
									Open source
								</span>
								v{__APP_VERSION__} on GitHub
								<ArrowUpRight
									className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
									aria-hidden="true"
								/>
							</a>
							<G2Stars />
						</div>

						<h1
							className={`${DISPLAY} mt-7 text-[3.25rem] leading-[0.98] text-zinc-950 sm:text-7xl lg:text-[4.6rem] xl:text-[5rem]`}
						>
							Know how AI talks about{" "}
							<span className="relative inline-block whitespace-nowrap text-blue-600">
								your brand
								<Squiggle />
								<span className="text-zinc-950">.</span>
							</span>
						</h1>
						<p className="mt-8 max-w-[34rem] text-pretty text-lg leading-relaxed text-zinc-600 md:text-xl">
							Track your brand's visibility in ChatGPT, Perplexity, Gemini, and every other major AI model. Monitor
							mentions, see which sources get cited, and benchmark competitors — in our cloud or on your own servers.
						</p>

						<div className="mt-9 flex flex-wrap items-center gap-3">
							<CloudButton />
							<SelfHostButton />
							<TextLink href={DEMO_URL}>Live demo</TextLink>
						</div>
						<p className="mt-4 text-sm text-zinc-500">
							Cloud from <span className="font-semibold text-zinc-800">${CLOUD_ENTRY_PRICE_USD}/mo</span>. Self-hosting
							is free forever.
						</p>

						<div className="[&>div]:mt-10">
							<CustomerLogosInline />
						</div>
					</div>

					<AnswerCard />
				</div>
			</div>
		</section>
	);
}
