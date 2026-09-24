import { Check } from "lucide-react";
import { CARD, SectionHeading } from "./ui";

interface Step {
	title: string;
	body: string;
	/** A screenshot, or null for the setup step, which has no single page to show. */
	src: string | null;
	alt: string;
}

const STEPS: Step[] = [
	{
		title: "Add your brand",
		body: "Point Elmo at your site. It suggests the prompts your buyers ask and the competitors to track against.",
		src: null,
		alt: "",
	},
	{
		title: "See where you stand",
		body: "Visibility, share of voice, and the sources AI cites, sampled up to 4× daily from the real apps.",
		src: "/screenshots/citations.png",
		alt: "Elmo citations page showing which domains AI answers cite and your share of them",
	},
	{
		title: "Know what to fix",
		body: "Opportunities ranked by impact. Elmo keeps re-asking, so you see which changes moved the answer.",
		src: "/screenshots/opportunities.png",
		alt: "Elmo opportunities page with prioritized recommendations for content and sources",
	},
];

const SUGGESTED = [
	"best standing desk for a small office",
	"standing desk vs sit-stand converter",
	"quietest standing desk motor",
];
const COMPETITORS = ["Uplane", "Deskhaven", "Riserly"];

/** Stands in for the Prompt Wizard: a site goes in, prompts and competitors come out. */
function SetupSketch() {
	return (
		<div
			aria-hidden="true"
			className="flex aspect-[16/10] flex-col justify-center gap-3 rounded-t-2xl border-b border-zinc-200/80 bg-zinc-50 px-6"
		>
			<div className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm text-zinc-900 ring-1 ring-zinc-200">
				<span className="text-zinc-400">https://</span>yourbrand.com
				<span className="ml-auto rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">Suggest</span>
			</div>
			<ul className="space-y-1.5">
				{SUGGESTED.map((prompt) => (
					<li key={prompt} className="flex items-center gap-2 text-[13px] text-zinc-700">
						<span className="inline-flex size-4 shrink-0 items-center justify-center rounded bg-blue-600 text-white">
							<Check className="size-3" strokeWidth={3} />
						</span>
						<span className="truncate">{prompt}</span>
					</li>
				))}
			</ul>
			<div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
				vs.
				{COMPETITORS.map((c) => (
					<span key={c} className="rounded-full bg-white px-2 py-0.5 font-medium text-zinc-700 ring-1 ring-zinc-200">
						{c}
					</span>
				))}
			</div>
		</div>
	);
}

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
							{step.src ? <Crop src={step.src} alt={step.alt} /> : <SetupSketch />}
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
