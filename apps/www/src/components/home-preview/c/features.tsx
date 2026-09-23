"use client";

import { useState } from "react";
import { FOCUS_RING, ScreenFrame, SectionHeading } from "./ui";

interface Feature {
	id: string;
	label: string;
	title: string;
	description: string;
	src: string;
	alt: string;
}

interface Group {
	name: string;
	features: Feature[];
}

const groups: Group[] = [
	{
		name: "Measure",
		features: [
			{
				id: "visibility",
				label: "Visibility",
				title: "Track visibility across every prompt and model.",
				description:
					"Filter by AI model, time range, and tags. See per-prompt visibility scores with trend lines comparing your brand against competitors — and watch them move over months as your content changes.",
				src: "/screenshots/visibility.png",
				alt: "Per-prompt visibility tracking with brand and competitor trend lines across multiple AI models",
			},
			{
				id: "share-of-voice",
				label: "Share of voice",
				title: "See how you stack up against the competition.",
				description:
					"Compare your brand's mention share against every competitor. A live leaderboard ranks who AI engines name most, and where you're missing.",
				src: "/screenshots/share-of-voice.png",
				alt: "Share of voice donut chart, 30-day trend, and a leaderboard ranking your brand's mention share against competitors",
			},
		],
	},
	{
		name: "Understand",
		features: [
			{
				id: "fan-out",
				label: "Query fan-out",
				title: "See the searches behind every AI answer.",
				description:
					"AI engines fan a single prompt out into dozens of web searches. Track the exact queries and keywords they generate — and how they rewrite your prompts along the way.",
				src: "/screenshots/query-fan-out.png",
				alt: "Query fan-out word cloud of the search terms AI engines generate, with a breakdown of how prompts get rewritten",
			},
			{
				id: "citations",
				label: "Citations",
				title: "Understand where AI gets its information.",
				description:
					"See which domains and URLs AI models cite most, track new and dropped sources over time, and break down citations by category — brand, competitor, social, and more.",
				src: "/screenshots/citations.png",
				alt: "Citation analysis showing brand citation share, unique domains, total citations, and category and page-type trends",
			},
			{
				id: "responses",
				label: "Responses",
				title: "Inspect every individual AI response.",
				description:
					"Drill into any prompt to see exactly what each AI model said, which brands were mentioned, and what sources were cited.",
				src: "/screenshots/prompt-detail.png",
				alt: "Prompt history detail showing an individual AI response with the brands it mentioned and the sources behind it",
			},
		],
	},
	{
		name: "Act",
		features: [
			{
				id: "opportunities",
				label: "Opportunities",
				title: "Know exactly what to do next.",
				description:
					"Get AI-generated recommendations ranked by impact: content to create, pages to refresh, third-party sources to pitch.",
				src: "/screenshots/opportunities.png",
				alt: "Opportunities page with an AI-generated summary and prioritized recommendations for content to create and sources to pitch",
			},
			{
				id: "prompts",
				label: "Prompts",
				title: "Search, tag, and organize your prompts.",
				description:
					"Full-text search finds any prompt instantly. Tag them to filter, and track visibility scores per prompt.",
				src: "/screenshots/prompts.png",
				alt: "Prompt filtering with the Tags dropdown open showing Basketball and Kids selected",
			},
		],
	},
];

const all = groups.flatMap((g) => g.features.map((f) => ({ ...f, group: g.name })));

export function Features() {
	const [active, setActive] = useState(all[0].id);

	function onKeyDown(e: React.KeyboardEvent) {
		const i = all.findIndex((f) => f.id === active);
		let next = -1;
		if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % all.length;
		if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + all.length) % all.length;
		if (e.key === "Home") next = 0;
		if (e.key === "End") next = all.length - 1;
		if (next < 0) return;
		e.preventDefault();
		setActive(all[next].id);
		document.getElementById(`feature-tab-${all[next].id}`)?.focus();
	}

	return (
		<section id="features" aria-labelledby="features-heading" className="border-t border-white/[0.06] py-20 lg:py-24">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<SectionHeading
					id="features-heading"
					eyebrow="Product"
					title="All you need to grow AI visibility."
					lede="Measure where you show up, understand why, and act on it — one prompt set, every model."
				/>

				<div className="mt-12 grid gap-8 lg:grid-cols-12 lg:gap-10">
					{/* A single tablist that reflows: a scrolling chip row on small screens,
					    a grouped index beside the screenshot on large ones. */}
					<div
						role="tablist"
						aria-label="Product features"
						aria-orientation="vertical"
						onKeyDown={onKeyDown}
						className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:col-span-4 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0"
					>
						{groups.map((g) => (
							<div key={g.name} className="contents lg:mb-4 lg:block">
								<p
									aria-hidden="true"
									className="hidden pb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 lg:block"
								>
									{g.name}
								</p>
								{g.features.map((f) => {
									const selected = f.id === active;
									return (
										<button
											key={f.id}
											id={`feature-tab-${f.id}`}
											type="button"
											role="tab"
											aria-selected={selected}
											aria-controls={`feature-panel-${f.id}`}
											tabIndex={selected ? 0 : -1}
											onClick={() => setActive(f.id)}
											className={`group relative shrink-0 rounded-full px-3.5 py-1.5 text-left text-sm whitespace-nowrap ring-1 transition-colors lg:block lg:w-full lg:rounded-none lg:border-l lg:py-3 lg:pr-3 lg:pl-4 lg:whitespace-normal lg:ring-0 ${FOCUS_RING} ${
												selected
													? "bg-white text-zinc-950 ring-white lg:border-blue-500 lg:bg-transparent lg:bg-gradient-to-r lg:from-blue-500/[0.08] lg:to-transparent lg:text-white"
													: "text-zinc-400 ring-white/10 hover:text-zinc-100 lg:border-white/10 lg:hover:border-white/30"
											}`}
										>
											<span
												aria-hidden="true"
												className={`mr-3 hidden font-mono text-[11px] tabular-nums lg:inline ${selected ? "text-blue-400" : "text-zinc-600"}`}
											>
												{String(all.findIndex((x) => x.id === f.id) + 1).padStart(2, "0")}
											</span>
											<span className="lg:text-[15px]">{f.label}</span>
											{selected ? (
												<span className="hidden lg:block">
													<span className="mt-3 block text-[15px] font-medium leading-snug text-white">{f.title}</span>
													<span className="mt-1.5 block text-sm/6 text-zinc-400">{f.description}</span>
												</span>
											) : null}
										</button>
									);
								})}
							</div>
						))}
					</div>

					<div className="lg:sticky lg:top-24 lg:col-span-8 lg:self-start">
						{all.map((f) => (
							<div
								key={f.id}
								id={`feature-panel-${f.id}`}
								role="tabpanel"
								aria-labelledby={`feature-tab-${f.id}`}
								hidden={f.id !== active}
							>
								<ScreenFrame src={f.src} alt={f.alt} label={`demo.elmohq.com · ${f.label}`} />
								<div className="mt-6 grid gap-2 sm:grid-cols-12 sm:gap-6 lg:sr-only">
									<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-400 sm:col-span-3 sm:pt-1">
										{f.group} / {f.label}
									</p>
									<div className="sm:col-span-9">
										<h3 className="text-xl font-medium tracking-tight text-white">{f.title}</h3>
										<p className="mt-2 max-w-[60ch] text-pretty text-[15px]/7 text-zinc-400">{f.description}</p>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
