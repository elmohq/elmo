import { CARD, SectionHeading } from "./ui";

interface Step {
	title: string;
	body: string;
	src: string;
	alt: string;
}

const STEPS: Step[] = [
	{
		title: "Add your brand",
		body: "Point Elmo at your site. It suggests the prompts your buyers ask and the competitors to track against.",
		src: "/screenshots/prompt-settings.png",
		alt: "Elmo prompts settings listing the buyer prompts tracked for Nike, each tagged by topic",
	},
	{
		title: "See where you stand",
		body: "Visibility, share of voice, and the sources AI cites, sampled up to 4× daily from the real apps.",
		src: "/screenshots/visibility.png",
		alt: "Elmo visibility page showing per-prompt visibility over time against competitors",
	},
	{
		title: "Know what to fix",
		body: "Opportunities ranked by impact. Elmo keeps you updated, so you always know what to do next.",
		src: "/screenshots/opportunities.png",
		alt: "Elmo opportunities page with prioritized recommendations for content and sources",
	},
];

/**
 * Each screenshot sits in a window that bleeds off the panel's right and
 * bottom edges, so the crop reads as deliberate. The capture includes the app
 * sidebar (the left 17.5% of every capture), which is shifted out of view.
 */
function Crop({ src, alt }: { src: string; alt: string }) {
	return (
		<div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl border-b border-zinc-200/80 bg-gradient-to-br from-blue-50 to-zinc-50">
			<div className="absolute bottom-0 left-6 right-0 top-6 overflow-hidden rounded-tl-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_12px_32px_-12px_rgb(24_24_27/0.18)]">
				<img
					src={src}
					alt={alt}
					width={3000}
					height={1800}
					loading="lazy"
					decoding="async"
					className="absolute left-[-29.75%] top-[-1.5%] w-[170%] max-w-none"
				/>
			</div>
		</div>
	);
}

export function HowItWorks() {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					title="From zero to a plan in one afternoon."
					lede="No sales call, no bloat. Elmo sets up your tracking and tells you what to change."
				/>
				<ol className="mt-12 grid gap-5 md:grid-cols-3">
					{STEPS.map((step, i) => (
						<li key={step.title} className={`flex flex-col overflow-hidden ${CARD}`}>
							<Crop src={step.src} alt={step.alt} />
							<div className="p-6">
								<p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.015em] text-zinc-950">
									<span className="inline-flex size-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white tabular-nums">
										{i + 1}
									</span>
									{step.title}
								</p>
								<p className="mt-2 text-pretty text-[15px]/6 text-zinc-600">{step.body}</p>
							</div>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
