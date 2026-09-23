import {
	Eye,
	LayoutDashboard,
	Lightbulb,
	Link2,
	type LucideIcon,
	MessageSquareText,
	PieChart,
	Search,
	Tags,
	TrendingUp,
} from "lucide-react";
import { useId, useState } from "react";
import { VisibilityTrendGraphic } from "@/components/feature-graphics";
import { BrowserFrame, SectionHeading } from "./ui";

interface Feature {
	id: string;
	label: string;
	icon: LucideIcon;
	title: string;
	description: string;
	visual: { src: string; alt: string } | "trend";
}

interface FeatureGroup {
	name: string;
	features: Feature[];
}

const groups: FeatureGroup[] = [
	{
		name: "Measure",
		features: [
			{
				id: "dashboard",
				label: "Dashboard",
				icon: LayoutDashboard,
				title: "Your AI visibility command center.",
				description: "Current visibility, share of voice, and 30-day trends on one dashboard.",
				visual: {
					src: "/screenshots/overview.png",
					alt: "Elmo dashboard overview showing AI visibility and share of voice scores with 30-day trend charts",
				},
			},
			{
				id: "visibility",
				label: "Visibility",
				icon: Eye,
				title: "Track visibility across every prompt and model.",
				description:
					"Filter by AI model, time range, and tags. See per-prompt visibility scores with trend lines comparing your brand against competitors.",
				visual: {
					src: "/screenshots/visibility.png",
					alt: "Elmo visibility page with per-prompt visibility scores and trend lines against competitors",
				},
			},
			{
				id: "share-of-voice",
				label: "Share of voice",
				icon: PieChart,
				title: "See how you stack up against the competition.",
				description:
					"Compare your brand's mention share against every competitor. A live leaderboard ranks who AI engines name most, and where you're missing.",
				visual: {
					src: "/screenshots/share-of-voice.png",
					alt: "Elmo share of voice leaderboard ranking brands by how often AI engines mention them",
				},
			},
			{
				id: "trends",
				label: "Trends",
				icon: TrendingUp,
				title: "Track visibility trends over months.",
				description:
					"Watch how your brand's AI visibility changes over time compared to competitors. Spot the impact of content changes and market shifts.",
				visual: "trend",
			},
		],
	},
	{
		name: "Understand",
		features: [
			{
				id: "query-fan-out",
				label: "Query fan-out",
				icon: Search,
				title: "See the searches behind every AI answer.",
				description:
					"AI engines fan a single prompt out into dozens of web searches. Track the exact queries and keywords they generate — and how they rewrite your prompts along the way.",
				visual: {
					src: "/screenshots/query-fan-out.png",
					alt: "Elmo query fan-out page listing the web searches AI engines ran for a prompt",
				},
			},
			{
				id: "citations",
				label: "Citations",
				icon: Link2,
				title: "Understand where AI gets its information.",
				description:
					"See which domains and URLs AI models cite most, track new and dropped sources over time, and break down citations by category — brand, competitor, social, and more.",
				visual: {
					src: "/screenshots/citations.png",
					alt: "Elmo citations page showing the most-cited domains and a breakdown by category",
				},
			},
			{
				id: "deep-dive",
				label: "Response deep dive",
				icon: MessageSquareText,
				title: "Inspect every individual AI response.",
				description:
					"Drill into any prompt to see exactly what each AI model said, which brands were mentioned, and what sources were cited.",
				visual: {
					src: "/screenshots/prompt-detail.png",
					alt: "Elmo prompt detail page showing an individual AI response with mentioned brands and cited sources",
				},
			},
		],
	},
	{
		name: "Act",
		features: [
			{
				id: "opportunities",
				label: "Opportunities",
				icon: Lightbulb,
				title: "Know exactly what to do next.",
				description:
					"Get AI-generated recommendations ranked by impact: content to create, pages to refresh, third-party sources to pitch.",
				visual: {
					src: "/screenshots/opportunities.png",
					alt: "Elmo opportunities page with recommendations ranked by impact",
				},
			},
			{
				id: "prompts",
				label: "Prompt library",
				icon: Tags,
				title: "Search, tag, and organize your prompts.",
				description:
					"Full-text search finds any prompt instantly. Tag them to filter, and track visibility scores per prompt.",
				visual: {
					src: "/screenshots/prompts.png",
					alt: "Elmo prompts page with full-text search, tags, and per-prompt visibility scores",
				},
			},
		],
	},
];

function Visual({ feature, eager = false }: { feature: Feature; eager?: boolean }) {
	if (feature.visual === "trend") {
		return (
			<div className="overflow-hidden rounded-lg bg-white ring-1 ring-[#1c1a17]/15 [&>div]:border-0">
				<VisibilityTrendGraphic />
			</div>
		);
	}
	return (
		<BrowserFrame>
			<img
				src={feature.visual.src}
				alt={feature.visual.alt}
				width={3000}
				height={1800}
				loading={eager ? "eager" : "lazy"}
				decoding="async"
				className="block aspect-[5/3] w-full object-cover object-left-top"
			/>
		</BrowserFrame>
	);
}

export function Features() {
	const all = groups.flatMap((g) => g.features);
	const [activeId, setActiveId] = useState(all[1].id);
	const baseId = useId();
	const active = all.find((f) => f.id === activeId) ?? all[0];

	return (
		<section id="features">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					n="§ 02"
					label="The product"
					title="From the number, to why, to what to do next."
					lede="Measure where you show up, understand the answers and sources behind it, then act — from a single prompt to a year of trends."
				/>

				<div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-12 lg:items-start lg:gap-12">
					<div className="lg:col-span-4">
						{groups.map((group, gi) => (
							<div key={group.name} className="mb-6 last:mb-0">
								<p className="mb-1 flex items-center gap-2 border-b border-[#1c1a17]/12 pb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-stone-600">
									<span className="tabular-nums text-blue-600">{String(gi + 1).padStart(2, "0")}</span>
									{group.name}
								</p>
								<ul>
									{group.features.map((f) => {
										const isActive = f.id === activeId;
										const Icon = f.icon;
										const panelId = `${baseId}-${f.id}`;
										return (
											<li key={f.id} className="border-b border-[#1c1a17]/8 last:border-b-0">
												<button
													type="button"
													aria-expanded={isActive}
													aria-controls={panelId}
													onClick={() => setActiveId(f.id)}
													className="flex w-full items-center gap-3 rounded-sm py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
												>
													<Icon
														className={`size-4 shrink-0 ${isActive ? "text-blue-600" : "text-stone-400"}`}
														aria-hidden="true"
													/>
													<span
														className={`flex-1 text-[15px] font-medium ${isActive ? "text-[#1c1a17]" : "text-stone-600 hover:text-[#1c1a17]"}`}
													>
														{f.label}
													</span>
													<span
														aria-hidden="true"
														className={`h-px w-5 transition-colors ${isActive ? "bg-blue-600" : "bg-transparent"}`}
													/>
												</button>
												<div
													id={panelId}
													inert={!isActive}
													className={`grid transition-[grid-template-rows] duration-300 ease-out ${isActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
												>
													<div className="overflow-hidden">
														<div className="pb-4 pl-7">
															<h3 className="text-[15px] font-semibold leading-snug text-[#1c1a17]">{f.title}</h3>
															<p className="mt-1.5 text-pretty text-sm/6 text-stone-600">{f.description}</p>
															{isActive ? (
																<div className="mt-4 lg:hidden">
																	<Visual feature={f} />
																</div>
															) : null}
														</div>
													</div>
												</div>
											</li>
										);
									})}
								</ul>
							</div>
						))}
					</div>

					<div className="sticky top-24 hidden lg:col-span-8 lg:block">
						<div className="rounded-xl bg-[#efece4] p-5 ring-1 ring-[#1c1a17]/8">
							{all.map((f) => (
								<div key={f.id} hidden={f.id !== activeId}>
									<Visual feature={f} eager={f.id === activeId} />
								</div>
							))}
							<p className="mt-4 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.14em] text-stone-600">
								<span>Fig. 2 — {active.label}</span>
								<span>Screenshot of the Elmo app</span>
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
