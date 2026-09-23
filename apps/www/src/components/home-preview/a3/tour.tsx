import {
	ChevronDown,
	ChevronsUpDown,
	Eye,
	LayoutDashboard,
	Lightbulb,
	Link2,
	type LucideIcon,
	Pause,
	PieChart,
	Play,
	Search,
	Tags,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { CitationsView, OpportunitiesView, SAMPLE_BRAND, ShareOfVoiceView, VisibilityView } from "./tour-views";

const STEP_MS = 5500;

interface Step {
	id: string;
	question: string;
	short: string;
	nav: string;
	title: string;
	View: () => React.JSX.Element;
	/** Annotations, in the order of the numbered markers inside the view. */
	callouts: [string, string];
	caption: string;
}

const STEPS: Step[] = [
	{
		id: "visibility",
		question: "Does ChatGPT recommend us?",
		short: "Does AI recommend us?",
		nav: "Visibility",
		title: "Visibility",
		View: VisibilityView,
		caption: "Visibility is the share of tracked AI answers that mention your brand, broken down by model.",
		callouts: [
			"The share of AI answers that mention you, across every prompt you track.",
			"Split by model, so you see exactly where you're missing.",
		],
	},
	{
		id: "share-of-voice",
		question: "Who's winning instead?",
		short: "Who's winning instead?",
		nav: "Share of voice",
		title: "Share of voice",
		View: ShareOfVoiceView,
		caption: "Share of voice ranks every brand AI names for your prompts, so you see who wins when you don't.",
		callouts: [
			"Summit Gear is named in 31% of answers, 9 points ahead of you.",
			"Your share is climbing: up 4 points in 30 days.",
		],
	},
	{
		id: "citations",
		question: "Where does AI get its answers?",
		short: "Where do answers come from?",
		nav: "Citations",
		title: "Citations",
		View: CitationsView,
		caption: "Citations show the domains AI models pull from — and how little of it is your own site.",
		callouts: [
			"Only 4% of citations point to your own site.",
			"The review site AI cites most. A natural pitch target.",
		],
	},
	{
		id: "opportunities",
		question: "What should we do next?",
		short: "What should we do next?",
		nav: "Opportunities",
		title: "Opportunities",
		View: OpportunitiesView,
		caption: "Opportunities turn the data into a ranked to-do list: what to create, refresh, pitch, and seed.",
		callouts: [
			"Ranked by impact, so you know what to do first.",
			"Each one links to the prompts and sources behind it.",
		],
	},
];

const NAV: { label: string; icon: LucideIcon }[] = [
	{ label: "Overview", icon: LayoutDashboard },
	{ label: "Visibility", icon: Eye },
	{ label: "Share of voice", icon: PieChart },
	{ label: "Query fan-out", icon: Search },
	{ label: "Citations", icon: Link2 },
	{ label: "Opportunities", icon: Lightbulb },
	{ label: "Prompts", icon: Tags },
];

const keyframes = `
@keyframes a3-tour-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes a3-tour-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes a3-callout-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
`;

/** Roving-focus target for a tablist key press, or null for keys the tablist ignores. */
function keyTarget(key: string, current: number, count: number): number | null {
	switch (key) {
		case "ArrowRight":
			return (current + 1) % count;
		case "ArrowLeft":
			return (current - 1 + count) % count;
		case "Home":
			return 0;
		case "End":
			return count - 1;
		default:
			return null;
	}
}

function useReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mq.matches);
		const onChange = () => setReduced(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);
	return reduced;
}

function Callouts({ step, animate }: { step: Step; animate: boolean }) {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute bottom-6 -left-10 z-10 w-[15.5rem] space-y-2 max-lg:hidden xl:-left-14"
		>
			{step.callouts.map((text, i) => (
				<div
					key={`${step.id}-${text}`}
					className={`flex gap-3 rounded-xl bg-zinc-950 p-3.5 text-[13px]/5 text-zinc-200 shadow-[0_16px_40px_-12px_rgb(24_24_27/0.55)] ring-1 ring-white/10 ${animate ? "motion-safe:animate-[a3-callout-in_450ms_ease-out_both]" : ""}`}
					style={animate ? { animationDelay: `${200 + i * 150}ms` } : undefined}
				>
					<span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 font-mono text-[11px] font-medium text-white">
						{i + 1}
					</span>
					<span>{text}</span>
				</div>
			))}
		</div>
	);
}

function Sidebar({ active }: { active: string }) {
	return (
		<aside
			aria-hidden="true"
			className="flex w-52 shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-50/70 p-3 max-md:hidden"
		>
			<div className="flex items-center justify-between px-2 pt-1">
				<Logo className="text-2xl" />
			</div>
			<div className="mt-4 flex items-center gap-2.5 rounded-lg bg-white px-2.5 py-2 shadow-[0_0_0_1px_rgb(24_24_27/0.08)]">
				<span className="inline-flex size-6 items-center justify-center rounded-md bg-blue-600 text-[10px] font-semibold text-white">
					AT
				</span>
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-900">{SAMPLE_BRAND}</span>
				<ChevronsUpDown className="size-3.5 text-zinc-400" />
			</div>
			<p className="mt-5 px-2 text-[11px] font-medium text-zinc-400">Dashboard</p>
			<ul className="mt-1.5 space-y-0.5">
				{NAV.map((n) => {
					const Icon = n.icon;
					const on = n.label === active;
					return (
						<li
							key={n.label}
							className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${on ? "bg-white font-medium text-zinc-950 shadow-[0_0_0_1px_rgb(24_24_27/0.08)]" : "text-zinc-600"}`}
						>
							<Icon className={`size-4 ${on ? "text-blue-600" : "text-zinc-400"}`} />
							{n.label}
						</li>
					);
				})}
			</ul>
		</aside>
	);
}

function TourTab({
	step,
	index,
	baseId,
	selected,
	cycle,
	playState,
	tabRef,
	onSelect,
	onDone,
}: {
	step: Step;
	index: number;
	baseId: string;
	selected: boolean;
	cycle: number;
	/** null when motion is reduced: no timer, no auto-advance. */
	playState: "running" | "paused" | null;
	tabRef: (el: HTMLButtonElement | null) => void;
	onSelect: () => void;
	onDone: () => void;
}) {
	return (
		<button
			ref={tabRef}
			type="button"
			role="tab"
			id={`${baseId}-tab-${step.id}`}
			aria-selected={selected}
			aria-controls={`${baseId}-panel`}
			tabIndex={selected ? 0 : -1}
			onClick={onSelect}
			className={`group relative shrink-0 snap-start overflow-hidden text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 max-md:rounded-full max-md:px-4 max-md:py-2 max-md:text-[13px] max-md:font-medium max-md:ring-1 md:pt-4 md:pb-1 ${selected ? "max-md:bg-zinc-950 max-md:text-white max-md:ring-zinc-950" : "max-md:bg-white max-md:text-zinc-600 max-md:ring-zinc-200"}`}
		>
			<span
				aria-hidden="true"
				className="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-full bg-zinc-200 max-md:inset-x-4 max-md:top-auto max-md:bottom-1 max-md:h-px max-md:bg-transparent"
			>
				{selected ? (
					<span
						key={cycle}
						onAnimationEnd={onDone}
						className="block h-full origin-left bg-blue-600 max-md:bg-white/70"
						style={
							playState
								? { animation: `a3-tour-progress ${STEP_MS}ms linear forwards`, animationPlayState: playState }
								: undefined
						}
					/>
				) : null}
			</span>
			<span className="md:hidden">{step.short}</span>
			<span className="max-md:hidden">
				<span
					aria-hidden="true"
					className={`block font-mono text-[11px] tracking-[0.14em] ${selected ? "text-blue-600" : "text-zinc-400 group-hover:text-zinc-500"}`}
				>
					{String(index + 1).padStart(2, "0")}
				</span>
				<span
					className={`mt-1 block text-[15px] font-medium leading-snug lg:text-base ${selected ? "text-zinc-950" : "text-zinc-500 group-hover:text-zinc-800"}`}
				>
					{step.question}
				</span>
			</span>
		</button>
	);
}

export function ProductTour() {
	const [active, setActive] = useState(0);
	const [cycle, setCycle] = useState(0);
	const [hovered, setHovered] = useState(false);
	const [focused, setFocused] = useState(false);
	const [inView, setInView] = useState(false);
	const [userPaused, setUserPaused] = useState(false);
	const reduced = useReducedMotion();
	const rootRef = useRef<HTMLElement>(null);
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const stripRef = useRef<HTMLDivElement>(null);
	const baseId = useId();

	const running = !reduced && !userPaused && !hovered && !focused && inView;
	const step = STEPS[active];

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
		io.observe(el);
		return () => io.disconnect();
	}, []);

	const select = useCallback((index: number) => {
		setActive(index);
		setCycle((c) => c + 1);
	}, []);

	// Keep the active chip visible in the mobile scroller without moving the page vertically.
	useEffect(() => {
		const strip = stripRef.current;
		const tab = tabRefs.current[active];
		if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return;
		strip.scrollTo({ left: tab.offsetLeft - 16, behavior: reduced ? "auto" : "smooth" });
	}, [active, reduced]);

	function onKeyDown(event: React.KeyboardEvent) {
		const next = keyTarget(event.key, active, STEPS.length);
		if (next === null) return;
		event.preventDefault();
		select(next);
		tabRefs.current[next]?.focus();
	}

	return (
		<section
			ref={rootRef}
			aria-label="Product tour"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onFocus={() => setFocused(true)}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
			}}
		>
			<style>{keyframes}</style>

			<div
				ref={stripRef}
				role="tablist"
				aria-label="Questions Elmo answers"
				onKeyDown={onKeyDown}
				className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden"
			>
				{STEPS.map((step, i) => (
					<TourTab
						key={step.id}
						step={step}
						index={i}
						baseId={baseId}
						selected={i === active}
						cycle={cycle}
						playState={reduced ? null : running ? "running" : "paused"}
						tabRef={(el) => {
							tabRefs.current[i] = el;
						}}
						onSelect={() => select(i)}
						onDone={() => select((i + 1) % STEPS.length)}
					/>
				))}
			</div>

			<div className="relative mt-5 md:mt-8">
				<div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_32px_64px_-16px_rgb(37_99_235/0.22)] md:rounded-2xl">
					<div className="flex h-10 items-center gap-3 border-b border-zinc-200/80 bg-zinc-50/80 px-3 md:px-4">
						<div aria-hidden="true" className="flex gap-1.5">
							<span className="size-2.5 rounded-full bg-zinc-300" />
							<span className="size-2.5 rounded-full bg-zinc-300" />
							<span className="size-2.5 rounded-full bg-zinc-300" />
						</div>
						<div
							aria-hidden="true"
							className="mx-auto hidden h-6 w-full max-w-xs items-center justify-center rounded-md bg-white px-3 font-mono text-[11px] text-zinc-500 ring-1 ring-zinc-200 sm:flex"
						>
							app.elmohq.com
						</div>
						<div className="flex items-center gap-1.5 max-sm:ml-auto">
							<span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-amber-50 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-200">
								Example data
							</span>
							{reduced ? null : (
								<button
									type="button"
									onClick={() => setUserPaused((p) => !p)}
									aria-label={userPaused ? "Play product tour" : "Pause product tour"}
									className="inline-flex size-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
								>
									{userPaused ? (
										<Play className="size-3 fill-current" aria-hidden="true" />
									) : (
										<Pause className="size-3 fill-current" aria-hidden="true" />
									)}
								</button>
							)}
						</div>
					</div>

					<div className="flex h-[27rem] sm:h-[30rem] lg:h-[37.5rem]">
						<Sidebar active={step.nav} />
						<div className="flex min-w-0 flex-1 flex-col bg-white">
							<div
								aria-hidden="true"
								className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-100 px-4 md:h-14 md:px-6"
							>
								<span className="text-[13px] text-zinc-400 max-sm:hidden">{SAMPLE_BRAND}</span>
								<span className="text-zinc-300 max-sm:hidden">/</span>
								<span className="text-sm font-medium text-zinc-900">{step.title}</span>
								<span className="ml-auto flex items-center gap-2">
									<span className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs text-zinc-600 ring-1 ring-zinc-200 max-lg:hidden">
										All models <ChevronDown className="size-3" />
									</span>
									<span className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs text-zinc-600 ring-1 ring-zinc-200">
										Last 30 days <ChevronDown className="size-3" />
									</span>
								</span>
							</div>
							<div
								id={`${baseId}-panel`}
								role="tabpanel"
								aria-labelledby={`${baseId}-tab-${step.id}`}
								className="relative min-h-0 flex-1 bg-zinc-50/40 p-3 sm:p-4 md:p-6"
							>
								<p className="sr-only">{step.caption}</p>
								<div key={step.id} className="h-full motion-safe:animate-[a3-tour-in_400ms_ease-out_both]">
									<step.View />
								</div>
							</div>
						</div>
					</div>
				</div>

				<Callouts step={step} animate={cycle > 0} />
			</div>

			<p aria-hidden="true" className="mx-auto mt-4 max-w-md text-center text-[13px]/5 text-zinc-500 lg:hidden">
				{step.caption}
			</p>
		</section>
	);
}
