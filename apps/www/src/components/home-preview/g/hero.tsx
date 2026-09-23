import MuxPlayer from "@mux/mux-player-react";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { Dialog, DialogContent, DialogTitle } from "@workspace/ui/components/dialog";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { Contrast } from "./contrast";
import { MODELS } from "./models";

const ENGINES = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Copilot"];
const CATEGORIES = ["invoicing app", "CRM for startups", "running shoes", "project tracker"];

const sentenceCss = `
@media (prefers-reduced-motion: no-preference) {
	.g-width { transition: width .55s cubic-bezier(.2,.8,.2,1); }
	.g-swap { transition: opacity .45s ease, transform .55s cubic-bezier(.2,.8,.2,1), filter .45s ease; }
	.g-caret { animation: g-blink 1.1s steps(1) infinite; }
}
@keyframes g-blink { 50% { opacity: 0; } }
`;

function iconFor(name: string) {
	return MODELS.find((m) => m.name === name)?.icon ?? MODELS[0].icon;
}

function useCycle() {
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (media.matches) return;
		const id = window.setInterval(() => setTick((t) => t + 1), 1900);
		return () => window.clearInterval(id);
	}, []);
	// The two chips take turns so only one word moves at a time.
	return { engine: Math.ceil(tick / 2) % ENGINES.length, category: Math.floor(tick / 2) % CATEGORIES.length };
}

/**
 * Stacks every option in one grid cell and eases the cell's width to the active
 * word, so the rest of the sentence glides instead of jumping.
 */
function Swap({
	items,
	active,
	render,
}: {
	items: string[];
	active: number;
	render: (item: string) => React.ReactNode;
}) {
	const refs = useRef<(HTMLSpanElement | null)[]>([]);
	const [widths, setWidths] = useState<number[]>([]);

	useLayoutEffect(() => {
		const measure = () => setWidths(refs.current.map((el) => el?.offsetWidth ?? 0));
		measure();
		document.fonts?.ready.then(measure);
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	return (
		<span
			className="g-width inline-grid overflow-hidden align-bottom"
			style={widths[active] ? { width: widths[active] } : undefined}
		>
			{items.map((item, i) => (
				<span
					key={item}
					ref={(el) => {
						refs.current[i] = el;
					}}
					className={`g-swap col-start-1 row-start-1 inline-flex w-max items-center whitespace-nowrap ${
						i === active
							? "translate-y-0 opacity-100 blur-none"
							: i === (active + items.length - 1) % items.length
								? "-translate-y-[55%] opacity-0 blur-[2px]"
								: "translate-y-[55%] opacity-0 blur-[2px]"
					}`}
				>
					{render(item)}
				</span>
			))}
		</span>
	);
}

const chip =
	"mx-[0.06em] inline-flex items-center rounded-[0.32em] px-[0.26em] py-[0.02em] align-[0.04em] leading-[1.12] text-[0.86em]";

function Sentence() {
	const { engine, category } = useCycle();
	return (
		<>
			<p className="sr-only">When buyers ask ChatGPT for the best invoicing app, does it say your brand?</p>
			<p
				aria-hidden="true"
				className="text-[2.35rem] font-medium leading-[1.14] tracking-[-0.04em] text-zinc-950 sm:text-6xl sm:leading-[1.1] lg:text-[5rem] lg:leading-[1.08]"
			>
				When buyers ask{" "}
				<span className={`${chip} bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.1),0_1px_2px_rgb(24_24_27/0.06)]`}>
					<Swap
						items={ENGINES}
						active={engine}
						render={(name) => {
							const Icon = iconFor(name);
							return (
								<>
									<span className="mr-[0.22em] inline-block size-[0.62em] text-zinc-900">
										<Icon />
									</span>
									{name}
								</>
							);
						}}
					/>
				</span>
				<br className="hidden lg:inline" /> for the best{" "}
				<span className={`${chip} bg-zinc-100 text-zinc-700 shadow-[inset_0_0_0_1px_rgb(24_24_27/0.06)]`}>
					<Swap items={CATEGORIES} active={category} render={(c) => c} />
				</span>
				,<br className="hidden lg:inline" /> does it say{" "}
				<span className={`${chip} whitespace-nowrap rounded-full bg-blue-600 px-[0.42em] text-white`}>
					your brand
					<span className="g-caret ml-[0.08em] inline-block h-[0.82em] w-[0.06em] translate-y-[0.04em] rounded-full bg-white/85" />
				</span>
				?
			</p>
		</>
	);
}

function DemoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-0 overflow-hidden bg-zinc-950 p-0 sm:max-w-5xl [&>button]:text-white">
				<DialogTitle className="sr-only">Elmo product demo</DialogTitle>
				<MuxPlayer
					playbackId="PYV9FNIG008vlkchyQf9KMTxDt028zQdshaM4VLC6lS1Q"
					streamType="on-demand"
					accentColor="#2563eb"
					poster="/demo-poster.png"
					autoPlay
					metadata={{
						video_id: "KGvs37kE02Z6mnTpcrnLJCtiS01V023aJEHK3MZlmaULPA",
						video_title: "Elmo demo",
					}}
					style={{ aspectRatio: "16 / 9", display: "block", width: "100%" }}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function Hero() {
	const [demoOpen, setDemoOpen] = useState(false);

	return (
		<section className="bg-white">
			<style>{sentenceCss}</style>
			<div className="mx-auto max-w-6xl px-4 pt-14 md:px-6 md:pt-16 lg:pt-20">
				<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-zinc-200 pb-5">
					<h1 className="flex items-center gap-2.5 text-sm text-zinc-500">
						<span className="size-1.5 rounded-full bg-blue-600" aria-hidden="true" />
						<span>
							<span className="font-medium text-zinc-950">AI visibility tracking</span>
							<span className="hidden sm:inline"> — know how AI answers talk about your brand</span>
						</span>
					</h1>
					<div className="flex items-center gap-4">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex items-center gap-1.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
						>
							Open source · v{__APP_VERSION__}
							<ArrowUpRight
								className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
						<span className="hidden sm:block">
							<G2Stars />
						</span>
					</div>
				</div>

				<div className="mt-10 md:mt-14">
					<Sentence />
				</div>

				<div className="mt-10 grid gap-8 md:mt-14 lg:grid-cols-12 lg:items-end lg:gap-12">
					<p className="max-w-[54ch] text-pretty text-base/7 text-zinc-600 md:text-lg/8 lg:col-span-7">
						Elmo asks the questions your buyers ask, across ChatGPT, Claude, Gemini, Perplexity, Google AI Overviews and
						more. Then it shows whether you're mentioned, where you rank, which sources the answers cite, and what to do
						next.
					</p>
					<div className="lg:col-span-5 lg:justify-self-end">
						<div className="flex flex-wrap items-center gap-2.5 [&>a]:h-10 [&>a]:px-4">
							<CloudSignupCTA />
							<SelfHostCTA />
						</div>
						<p className="mt-4 text-[13px] text-zinc-500">
							Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo · self-hosting is free ·{" "}
							<button
								type="button"
								onClick={() => setDemoOpen(true)}
								className="rounded-sm font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
							>
								watch the walkthrough
							</button>
						</p>
					</div>
				</div>

				<div className="mt-16 md:mt-24">
					<Contrast />
				</div>
			</div>
			<DemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
		</section>
	);
}
