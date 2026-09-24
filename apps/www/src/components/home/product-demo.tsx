import { demoSiteUrl } from "@workspace/config/referrals";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { externalRel } from "@/lib/external-link";

const DEMO_URL = demoSiteUrl("marketing-demo-frame");

/*
 * Each slide is a real screenshot. `y` is where that page's link sits in the
 * app sidebar, as a fraction of the 3000×1800 capture, so the cursor lands on
 * the item it "clicks".
 */
const SLIDES = [
	{
		src: "/screenshots/overview.png",
		label: "Overview",
		caption: "Your AI visibility and share of voice at a glance",
		y: 0.142,
	},
	{
		src: "/screenshots/visibility.png",
		label: "Visibility",
		caption: "How often AI names you, per prompt and model",
		y: 0.181,
	},
	{
		src: "/screenshots/share-of-voice.png",
		label: "Share of Voice",
		caption: "Who AI recommends instead of you",
		y: 0.221,
	},
	{
		src: "/screenshots/query-fan-out.png",
		label: "Query Fan-Out",
		caption: "The searches AI runs behind each answer",
		y: 0.261,
	},
	{
		src: "/screenshots/citations.png",
		label: "Citations",
		caption: "The sources AI trusts in your category",
		y: 0.301,
	},
	{
		src: "/screenshots/opportunities.png",
		label: "Opportunities",
		caption: "What to do next, ranked by impact",
		y: 0.341,
	},
] as const;

const CURSOR_X = 0.055;
const MOVE_MS = 900;
const HOLD_MS = 3200;

// Vercel's optimizer only exists in production; dev serves the originals.
function optimized(src: string, width: number) {
	return `/_vercel/image?${new URLSearchParams({ url: src, w: String(width), q: "75" })}`;
}

function Shot({ src, alt, active, eager }: { src: string; alt: string; active: boolean; eager: boolean }) {
	const prod = import.meta.env.PROD;
	return (
		<img
			src={prod ? optimized(src, 1200) : src}
			srcSet={prod ? [750, 1200, 1920].map((w) => `${optimized(src, w)} ${w}w`).join(", ") : undefined}
			sizes="(min-width: 1024px) 896px, 100vw"
			alt={alt}
			width={3000}
			height={1800}
			loading={eager ? "eager" : "lazy"}
			decoding="async"
			className="absolute inset-0 size-full object-cover object-left-top transition-opacity duration-500"
			style={{ opacity: active ? 1 : 0 }}
		/>
	);
}

function Cursor({ y, clicking }: { y: number; clicking: boolean }) {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute z-10 transition-[top] ease-[cubic-bezier(0.45,0,0.2,1)]"
			style={{ left: `${CURSOR_X * 100}%`, top: `${y * 100}%`, transitionDuration: `${MOVE_MS}ms` }}
		>
			<span
				className="absolute -left-3 -top-3 size-6 rounded-full bg-blue-500/30 transition-[transform,opacity] duration-300"
				style={{ transform: `scale(${clicking ? 1 : 0.2})`, opacity: clicking ? 1 : 0 }}
			/>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				className="relative size-5 drop-shadow-[0_2px_3px_rgb(0_0_0/0.25)] transition-transform duration-150 md:size-6"
				style={{ transform: clicking ? "scale(0.88)" : "none" }}
			>
				<path
					d="M5 3.5 L5 19 L9.3 15 L12.2 21.2 L15 20 L12.2 13.9 L18 13.9 Z"
					fill="#18181b"
					stroke="white"
					strokeWidth="1.5"
					strokeLinejoin="round"
				/>
			</svg>
		</div>
	);
}

export function ProductDemo() {
	const [index, setIndex] = useState(0);
	const [cursorY, setCursorY] = useState<number>(SLIDES[0].y);
	const [clicking, setClicking] = useState(false);
	const [auto, setAuto] = useState(true);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setAuto(false);
			return;
		}
		let visible = true;
		let current = 0;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

		// Move to the next sidebar link, press it, then swap the page underneath.
		const step = () => {
			if (!visible) {
				later(HOLD_MS, step);
				return;
			}
			const next = (current + 1) % SLIDES.length;
			setCursorY(SLIDES[next].y);
			later(MOVE_MS, () => setClicking(true));
			later(MOVE_MS + 160, () => {
				setIndex(next);
				current = next;
			});
			later(MOVE_MS + 360, () => setClicking(false));
			later(MOVE_MS + HOLD_MS, step);
		};
		later(HOLD_MS, step);

		const observer = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
		});
		if (ref.current) observer.observe(ref.current);
		return () => {
			for (const t of timers) clearTimeout(t);
			observer.disconnect();
		};
	}, [auto]);

	const pick = (i: number) => {
		setAuto(false);
		setIndex(i);
		setCursorY(SLIDES[i].y);
	};

	const slide = SLIDES[index];

	return (
		<div ref={ref} className="mx-auto max-w-4xl">
			<div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_2px_4px_rgb(24_24_27/0.04),0_32px_64px_-24px_rgb(37_99_235/0.28)]">
				<a
					href={DEMO_URL}
					target="_blank"
					rel={externalRel(DEMO_URL)}
					className="group flex h-10 items-center gap-3 border-b border-zinc-200/80 bg-zinc-50/80 px-3.5 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
				>
					<span aria-hidden="true" className="flex gap-1.5">
						<span className="size-2.5 rounded-full bg-zinc-300" />
						<span className="size-2.5 rounded-full bg-zinc-300" />
						<span className="size-2.5 rounded-full bg-zinc-300" />
					</span>
					<span className="mx-auto inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-blue-600 group-hover:text-blue-700">
						<span className="truncate">View the Live Demo</span>
						<ArrowUpRight
							className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
							aria-hidden="true"
						/>
					</span>
					<span aria-hidden="true" className="w-[42px]" />
				</a>
				<div className="relative aspect-[5/3] bg-zinc-50">
					{SLIDES.map((s, i) => (
						<Shot
							key={s.src}
							src={s.src}
							alt={`Elmo ${s.label} page: ${s.caption}`}
							active={i === index}
							eager={i < 2}
						/>
					))}
					{auto ? <Cursor y={cursorY} clicking={clicking} /> : null}
				</div>
			</div>

			<div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
				<p className="text-center text-[15px] text-zinc-600 sm:text-left" aria-live="polite">
					<span className="font-medium text-zinc-950">{slide.label}.</span> {slide.caption}.
				</p>
				<div className="flex items-center gap-5">
					<div className="flex items-center gap-1.5">
						{SLIDES.map((s, i) => (
							<button
								key={s.src}
								type="button"
								onClick={() => pick(i)}
								aria-label={`Show ${s.label}`}
								aria-current={i === index}
								className="group flex h-6 items-center"
							>
								<span
									className={`block h-1.5 rounded-full transition-all duration-300 ${
										i === index ? "w-5 bg-blue-600" : "w-1.5 bg-zinc-300 group-hover:bg-zinc-400"
									}`}
								/>
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
