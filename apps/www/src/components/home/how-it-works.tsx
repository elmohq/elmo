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
 * The screenshots include the app sidebar, which is noise at this size, so each
 * crop is scaled up and shifted to show the page content.
 */
function Crop({ src, alt }: { src: string; alt: string }) {
	return (
		<div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl border-b border-zinc-200/80 bg-zinc-50">
			<img
				src={src}
				alt={alt}
				width={3000}
				height={1800}
				loading="lazy"
				decoding="async"
				className="absolute left-[-23.5%] top-[-2%] w-[165%] max-w-none"
			/>
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
