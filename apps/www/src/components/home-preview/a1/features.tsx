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
			<div className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_24px_48px_-12px_rgb(37_99_235/0.18)] [&>div]:border-0">
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

	return (
		<section id="features" className="bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					eyebrow="Features"
					title="Everything you need to grow AI visibility."
					lede="Measure where you show up, understand why, and act on it — from a single prompt to a year of trends."
				/>

				<div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-12 lg:items-start lg:gap-12">
					<div className="lg:col-span-4">
						{groups.map((group) => (
							<div key={group.name} className="mb-5 last:mb-0">
								<p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">{group.name}</p>
								<ul className="space-y-0.5">
									{group.features.map((f) => {
										const active = f.id === activeId;
										const Icon = f.icon;
										const panelId = `${baseId}-${f.id}`;
										return (
											<li
												key={f.id}
												className={`rounded-lg transition-colors ${active ? "bg-zinc-50 ring-1 ring-zinc-200" : "hover:bg-zinc-50/70"}`}
											>
												<button
													type="button"
													aria-expanded={active}
													aria-controls={panelId}
													onClick={() => setActiveId(f.id)}
													className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
												>
													<Icon
														className={`size-4 shrink-0 ${active ? "text-blue-600" : "text-zinc-400"}`}
														aria-hidden="true"
													/>
													<span className={`text-[15px] font-medium ${active ? "text-zinc-950" : "text-zinc-600"}`}>
														{f.label}
													</span>
												</button>
												<div
													id={panelId}
													inert={!active}
													className={`grid transition-[grid-template-rows] duration-300 ease-out ${active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
												>
													<div className="overflow-hidden">
														<div className="px-3 pb-4 pl-10">
															<h3 className="text-[15px] font-semibold leading-snug text-zinc-950">{f.title}</h3>
															<p className="mt-1.5 text-pretty text-sm/6 text-zinc-600">{f.description}</p>
															{active ? (
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
						<div className="rounded-3xl bg-gradient-to-br from-blue-50 via-zinc-50 to-zinc-50 p-6 ring-1 ring-zinc-200/70">
							{all.map((f) => (
								<div key={f.id} hidden={f.id !== activeId}>
									<Visual feature={f} eager={f.id === activeId} />
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
