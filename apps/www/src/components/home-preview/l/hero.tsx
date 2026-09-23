import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloudSignupCTA, SelfHostCTA } from "@/components/cta-buttons";
import { externalRel } from "@/lib/external-link";
import { LOOP_ENGINES, LoopDiagram, type LoopEngine } from "./loop";
import { MODELS } from "./models";
import { ACCENT_TEXT } from "./ui";

const DEMO_URL = "https://demo.elmohq.com";

const heroCss = `
@media (prefers-reduced-motion: no-preference) {
	.l-width { transition: width .55s cubic-bezier(.2,.8,.2,1); }
	.l-swap { transition: opacity .45s ease, transform .55s cubic-bezier(.2,.8,.2,1), filter .45s ease; }
}
`;

function iconFor(name: string) {
	return MODELS.find((m) => m.name === name)?.icon ?? MODELS[0].icon;
}

/** Cycles the engine until the visitor picks one themselves. */
function useEngine() {
	const [index, setIndex] = useState(0);
	const [pinned, setPinned] = useState(false);
	useEffect(() => {
		if (pinned || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const id = window.setInterval(() => setIndex((i) => (i + 1) % LOOP_ENGINES.length), 3400);
		return () => window.clearInterval(id);
	}, [pinned]);
	const pick = (engine: LoopEngine) => {
		setPinned(true);
		setIndex(LOOP_ENGINES.indexOf(engine));
	};
	return { engine: LOOP_ENGINES[index], index, pick };
}

/**
 * Stacks every engine in one grid cell and eases the cell's width to the
 * active one, so the rest of the sentence glides instead of jumping.
 */
function EngineSwap({ active }: { active: number }) {
	const refs = useRef<(HTMLSpanElement | null)[]>([]);
	const [widths, setWidths] = useState<number[]>([]);

	useLayoutEffect(() => {
		const measure = () => setWidths(refs.current.map((el) => el?.offsetWidth ?? 0));
		measure();
		document.fonts?.ready.then(measure);
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, []);

	const n = LOOP_ENGINES.length;
	return (
		<span
			className="l-width inline-grid overflow-hidden align-bottom"
			style={widths[active] ? { width: widths[active] } : undefined}
		>
			{LOOP_ENGINES.map((name, i) => {
				const Icon = iconFor(name);
				const state =
					i === active
						? "translate-y-0 opacity-100 blur-none"
						: i === (active + n - 1) % n
							? "-translate-y-[60%] opacity-0 blur-[2px]"
							: "translate-y-[60%] opacity-0 blur-[2px]";
				return (
					<span
						key={name}
						ref={(el) => {
							refs.current[i] = el;
						}}
						className={`l-swap col-start-1 row-start-1 inline-flex w-max items-center whitespace-nowrap ${state}`}
					>
						<span className="mr-[0.24em] inline-block size-[0.6em] text-slate-900">
							<Icon />
						</span>
						{name}
					</span>
				);
			})}
		</span>
	);
}

export function Hero() {
	const { engine, index, pick } = useEngine();

	return (
		<section className="relative overflow-hidden">
			<style>{heroCss}</style>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-[900px] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(255_255_255/0.9),transparent_70%)]"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute left-1/2 top-[640px] h-[560px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(59_130_246/0.14),transparent)] max-md:hidden"
			/>

			<div className="relative mx-auto max-w-6xl px-4 pb-20 pt-12 md:px-6 md:pt-16 lg:pb-24 lg:pt-20">
				<div className="mx-auto flex max-w-5xl flex-col items-center text-center">
					<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
						<a
							href="https://github.com/elmohq/elmo"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-2 rounded-full bg-white pl-1 pr-3 text-xs text-slate-600 shadow-[0_0_0_1px_rgb(30_58_138/0.1),0_1px_2px_rgb(30_58_138/0.06)] transition hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-slate-100 px-2 font-mono text-[11px] text-slate-700">
								<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
							</span>
							Open source on GitHub
							<ArrowUpRight
								className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
						<G2Stars />
					</div>

					<h1 className="mt-8 text-[13px] font-medium text-blue-700 md:text-sm">
						AI visibility tracking for ChatGPT, Claude, Gemini, Perplexity and Google AI Overviews
					</h1>

					<p className="sr-only">When buyers ask ChatGPT, Perplexity, Claude or Gemini, is your brand in the answer?</p>
					<p
						aria-hidden="true"
						className="mt-5 text-balance text-[2.35rem] font-semibold leading-[1.1] tracking-[-0.04em] text-slate-950 sm:text-6xl lg:text-[4.25rem] lg:leading-[1.06]"
					>
						<span className="sm:whitespace-nowrap">
							When buyers ask{" "}
							<span className="mx-[0.04em] inline-flex items-center rounded-[0.3em] bg-white px-[0.24em] py-[0.02em] align-[0.04em] text-[0.86em] leading-[1.12] shadow-[0_0_0_1px_rgb(30_58_138/0.1),0_2px_4px_rgb(30_58_138/0.06),0_12px_24px_-12px_rgb(30_58_138/0.25)]">
								<EngineSwap active={index} />
							</span>
							,
						</span>
						<br /> is <span className={ACCENT_TEXT}>your brand</span> in the answer?
					</p>

					<p className="mt-7 max-w-[58ch] text-pretty text-base/7 text-slate-600 md:text-lg/8">
						Elmo asks AI the questions your buyers ask, measures who gets named and which sources it trusts, and tells
						you what to fix. One focused tool, open source.
					</p>

					<div className="mt-9 flex flex-wrap items-center justify-center gap-2.5 [&>a]:h-10 [&>a]:px-4">
						<CloudSignupCTA />
						<SelfHostCTA />
					</div>
					<p className="mt-4 flex flex-col items-center gap-1 text-[13px] text-slate-500 sm:block">
						<span>Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo · self-hosting is free</span>
						<span aria-hidden="true" className="hidden sm:inline">
							{" "}
							·{" "}
						</span>
						<a
							href={DEMO_URL}
							target="_blank"
							rel={externalRel(DEMO_URL)}
							className="rounded-sm font-medium text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							explore the live demo
						</a>
					</p>
				</div>

				<div className="mt-16 md:mt-20 xl:-mx-8">
					<LoopDiagram engine={engine} onPick={pick} />
				</div>
			</div>
		</section>
	);
}
