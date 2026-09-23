import { ArrowUpRight } from "lucide-react";
import { useId, useState } from "react";
import { BrowserFrame, SectionHeading } from "./ui";

interface View {
	id: string;
	label: string;
	description: string;
	src: string;
	alt: string;
}

// The hero bento already sells each capability, so this section only has to
// prove it's a real product: one frame, the actual screens.
const views: View[] = [
	{
		id: "overview",
		label: "Dashboard",
		description: "Current visibility, share of voice, and 30-day trends on one screen.",
		src: "/screenshots/overview.png",
		alt: "Elmo dashboard overview showing AI visibility and share of voice scores with 30-day trend charts",
	},
	{
		id: "visibility",
		label: "Visibility",
		description: "Per-prompt visibility with trend lines against competitors, filtered by model, time range, and tag.",
		src: "/screenshots/visibility.png",
		alt: "Elmo visibility page with per-prompt visibility scores and trend lines against competitors",
	},
	{
		id: "share-of-voice",
		label: "Share of voice",
		description: "A leaderboard of which brands AI engines name most, and where you're missing.",
		src: "/screenshots/share-of-voice.png",
		alt: "Elmo share of voice leaderboard ranking brands by how often AI engines mention them",
	},
	{
		id: "citations",
		label: "Citations",
		description: "The domains and URLs AI cites most, new and dropped sources, and a breakdown by category.",
		src: "/screenshots/citations.png",
		alt: "Elmo citations page showing the most-cited domains and a breakdown by category",
	},
	{
		id: "query-fan-out",
		label: "Query fan-out",
		description: "The exact web searches and keywords each engine generated from your prompts.",
		src: "/screenshots/query-fan-out.png",
		alt: "Elmo query fan-out page listing the web searches AI engines ran for a prompt",
	},
	{
		id: "prompt-detail",
		label: "Responses",
		description: "Every individual answer: what each model said, which brands it named, and what it cited.",
		src: "/screenshots/prompt-detail.png",
		alt: "Elmo prompt detail page showing an individual AI response with mentioned brands and cited sources",
	},
	{
		id: "opportunities",
		label: "Opportunities",
		description:
			"AI-generated recommendations ranked by impact: content to create, pages to refresh, sources to pitch.",
		src: "/screenshots/opportunities.png",
		alt: "Elmo opportunities page with recommendations ranked by impact",
	},
	{
		id: "prompts",
		label: "Prompts",
		description: "Full-text search and tags across your prompt library, with a visibility score for each.",
		src: "/screenshots/prompts.png",
		alt: "Elmo prompts page with full-text search, tags, and per-prompt visibility scores",
	},
];

export function Features() {
	const [activeId, setActiveId] = useState(views[0].id);
	const baseId = useId();
	const active = views.find((v) => v.id === activeId) ?? views[0];

	return (
		<section id="features" className="bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
					<div className="lg:col-span-7">
						<SectionHeading eyebrow="The product" title="The real screens behind every tile." />
					</div>
					<p className="max-w-[50ch] text-pretty text-base/7 text-zinc-600 lg:col-span-5 lg:pb-1.5">
						One app for measuring where you show up, understanding why, and acting on it. Or{" "}
						<a
							href="https://demo.elmohq.com"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
						>
							click around the live demo
							<ArrowUpRight className="size-3.5" aria-hidden="true" />
						</a>
					</p>
				</div>

				<div className="mt-10 lg:mt-12">
					<div
						role="tablist"
						aria-label="Elmo product screens"
						className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
					>
						{views.map((v) => {
							const selected = v.id === activeId;
							return (
								<button
									key={v.id}
									type="button"
									role="tab"
									id={`${baseId}-tab-${v.id}`}
									aria-selected={selected}
									aria-controls={`${baseId}-panel`}
									onClick={() => setActiveId(v.id)}
									className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
										selected
											? "bg-zinc-950 text-white"
											: "text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-950"
									}`}
								>
									{v.label}
								</button>
							);
						})}
					</div>

					<div
						id={`${baseId}-panel`}
						role="tabpanel"
						aria-labelledby={`${baseId}-tab-${active.id}`}
						className="mt-5 rounded-3xl bg-gradient-to-br from-blue-50 via-zinc-50 to-zinc-50 p-3 ring-1 ring-zinc-200/70 md:p-6"
					>
						<p className="mb-4 min-h-12 max-w-[70ch] px-1 text-pretty text-sm/6 text-zinc-600 md:mb-5 md:min-h-0 md:text-[15px]/6">
							<span className="font-medium text-zinc-950">{active.label}.</span> {active.description}
						</p>
						<BrowserFrame>
							<img
								key={active.id}
								src={active.src}
								alt={active.alt}
								width={3000}
								height={1800}
								decoding="async"
								className="block aspect-[5/3] w-full object-cover object-left-top"
							/>
						</BrowserFrame>
					</div>
				</div>
			</div>
		</section>
	);
}
