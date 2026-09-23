import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { bookDemoUrl } from "@workspace/config/referrals";
import { ArrowUpRight, Plus } from "lucide-react";
import { QuickstartBlock } from "@/components/quickstart-block";
import { externalRel } from "@/lib/external-link";
import type { FaqItem } from "@/lib/faqs";
import { BTN_GHOST_ON_BLUE, BTN_ON_BLUE, CloudButton, DISCORD_URL, DISPLAY, GITHUB_URL, SelfHostButton } from "./ui";

const BOOK_DEMO_URL = bookDemoUrl("marketing-cta");

function DiscordIcon({ className = "" }: { className?: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className={`fill-current ${className}`}>
			<path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
		</svg>
	);
}

export function CommunityB() {
	return (
		<section aria-labelledby="hb-community" className="px-5 md:px-8">
			<div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#5865F2] px-8 py-12 text-white md:px-14 md:py-14">
				<DiscordIcon className="pointer-events-none absolute -right-10 -bottom-16 size-72 rotate-[-12deg] text-white/10 md:right-10 md:size-80" />
				<div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
					<div>
						<h2 id="hb-community" className={`${DISPLAY} text-4xl leading-[1.05] md:text-5xl`}>
							Come say hi!
						</h2>
						<p className="mt-4 max-w-[40ch] text-pretty text-lg text-indigo-100">
							Ask questions and get help straight from the maintainers on Discord.
						</p>
					</div>
					<a
						href={DISCORD_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="group/btn inline-flex h-12 w-fit shrink-0 items-center gap-2.5 rounded-xl bg-white px-6 text-base font-semibold text-[#3c45a5] shadow-[0_3px_0_0_#2f3789] transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_5px_0_0_#2f3789] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					>
						<DiscordIcon className="size-5" />
						Join the Discord
						<ArrowUpRight
							className="size-4 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5"
							aria-hidden="true"
						/>
					</a>
				</div>
			</div>
		</section>
	);
}

export function FaqB({ items }: { items: FaqItem[] }) {
	return (
		<section aria-labelledby="hb-faq" className="py-24 lg:py-32">
			<div className="mx-auto grid max-w-6xl gap-10 px-5 md:px-8 lg:grid-cols-[2fr_3fr] lg:gap-16">
				<div>
					<p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-600">FAQ</p>
					<h2 id="hb-faq" className={`${DISPLAY} mt-4 text-4xl leading-[1.05] text-zinc-950 md:text-5xl`}>
						Questions, answered.
					</h2>
					<p className="mt-5 max-w-[34ch] text-pretty text-lg text-zinc-600">
						Something else on your mind?{" "}
						<a
							href={DISCORD_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="rounded-sm font-semibold text-blue-700 underline decoration-2 underline-offset-4 decoration-blue-300 hover:decoration-blue-700"
						>
							Ask us on Discord
						</a>
						.
					</p>
				</div>
				<div className="space-y-3">
					{items.map((item, i) => (
						<details
							key={item.question}
							open={i === 0}
							className="group rounded-2xl bg-white ring-1 ring-zinc-950/[0.07] transition-shadow open:shadow-[0_16px_40px_-24px_rgb(9_9_11/0.35)]"
						>
							<summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-2xl px-6 py-5 text-lg font-semibold text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
								{item.question}
								<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition duration-200 group-open:rotate-45 group-open:bg-blue-600 group-open:text-white">
									<Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
								</span>
							</summary>
							<p className="-mt-1 max-w-[62ch] px-6 pb-6 text-pretty text-base leading-relaxed text-zinc-600">
								{item.answer}
							</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}

export function CtaB() {
	return (
		<section aria-labelledby="hb-cta" className="relative overflow-hidden bg-blue-600 text-white">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgb(255_255_255/0.14)_1px,transparent_1.5px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,transparent,black)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -bottom-[0.3em] left-1/2 -translate-x-1/2 font-titan-one text-[32vw] leading-none text-white/[0.06] select-none lg:text-[22rem]"
			>
				elmo
			</div>
			<div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 md:px-8 lg:grid-cols-[7fr_5fr] lg:py-32">
				<div>
					<h2 id="hb-cta" className={`${DISPLAY} text-5xl leading-[1] md:text-7xl`}>
						Start tracking AI answers today.
					</h2>
					<p className="mt-6 max-w-[34rem] text-pretty text-lg text-blue-100 md:text-xl">
						We run everything for you in the cloud from ${CLOUD_ENTRY_PRICE_USD}/mo, or run the same open-source product
						on your own infrastructure for free.
					</p>
					<div className="mt-9 flex flex-wrap items-center gap-3">
						<CloudButton className={BTN_ON_BLUE} />
						<SelfHostButton className={BTN_GHOST_ON_BLUE} />
						<a
							href={GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="group/tl inline-flex items-center gap-1 rounded-md px-1 text-[15px] font-semibold text-white underline decoration-2 underline-offset-4 decoration-white/40 hover:decoration-white"
						>
							View source
							<ArrowUpRight
								className="size-4 transition-transform group-hover/tl:-translate-y-0.5 group-hover/tl:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
					</div>
					<p className="mt-6 text-[15px] text-blue-100">
						Rather be shown around?{" "}
						<a
							href={BOOK_DEMO_URL}
							target="_blank"
							rel={externalRel(BOOK_DEMO_URL)}
							className="rounded-sm font-semibold text-white underline decoration-2 underline-offset-4 decoration-white/40 hover:decoration-white"
						>
							Book a 30-minute demo
						</a>
						.
					</p>
				</div>
				<div className="[&>div]:rounded-2xl [&>div]:border-0 [&>div]:shadow-[0_30px_60px_-20px_rgb(9_9_11/0.6)] [&>div]:ring-1 [&>div]:ring-white/10 [&>div>div:last-child]:py-6 [&>div>div:last-child]:text-base">
					<p className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-blue-100">
						Or self-host in two commands
					</p>
					<QuickstartBlock />
				</div>
			</div>
		</section>
	);
}
