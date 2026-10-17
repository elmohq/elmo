import {
	CitationsPageGraphic,
	OpportunitiesPageGraphic,
	OverviewPageGraphic,
	PromptDetailGraphic,
	PromptSearchGraphic,
	QueryFanOutPageGraphic,
	SentimentPageGraphic,
	ShareOfVoicePageGraphic,
	VisibilityPageGraphic,
	VisibilityTrendGraphic,
} from "./feature-graphics";

interface Feature {
	title: string;
	description: string;
	graphic: React.ReactNode;
}

const features: Feature[] = [
	{
		title: "Your AI visibility command center.",
		description:
			"Visibility, share of voice, sentiment, and position on one dashboard, with every competitor ranked beside you.",
		graphic: <OverviewPageGraphic />,
	},
	{
		title: "Track visibility across every prompt and model.",
		description:
			"Filter by AI model, time range, and tags. See per-prompt visibility scores with trend lines comparing your brand against competitors.",
		graphic: <VisibilityPageGraphic />,
	},
	{
		title: "See how you stack up against the competition.",
		description:
			"Compare your brand's mention share against every competitor. A live leaderboard ranks who AI engines name most, and where you're missing.",
		graphic: <ShareOfVoicePageGraphic />,
	},
	{
		title: "Know how AI talks about you.",
		description:
			"Every answer that names you is read for praise or criticism and scored 0 to 100, beside each competitor and per model. See the exact passages behind the score and filter responses down to the negative ones.",
		graphic: <SentimentPageGraphic />,
	},
	{
		title: "See the searches behind every AI answer.",
		description:
			"AI engines fan a single prompt out into dozens of web searches. Track the exact queries and keywords they generate — and how they rewrite your prompts along the way.",
		graphic: <QueryFanOutPageGraphic />,
	},
	{
		title: "Understand where AI gets its information.",
		description:
			"See which domains and URLs AI models cite most, track new and dropped sources over time, and break down citations by category — brand, competitor, social, and more.",
		graphic: <CitationsPageGraphic />,
	},
	{
		title: "Know exactly what to do next.",
		description:
			"Get AI-generated recommendations ranked by impact: content to create, pages to refresh, third-party sources to pitch.",
		graphic: <OpportunitiesPageGraphic />,
	},
	{
		title: "Search, tag, and organize your prompts.",
		description:
			"Full-text search finds any prompt instantly. Tag them to filter, and track visibility scores per prompt.",
		graphic: <PromptSearchGraphic />,
	},
	{
		title: "Inspect every individual AI response.",
		description:
			"Drill into any prompt to see exactly what each AI model said, where each brand ranked in the answer and how it was described, and what sources were cited.",
		graphic: <PromptDetailGraphic />,
	},
	{
		title: "Track visibility trends over months.",
		description:
			"Watch how your brand's AI visibility changes over time compared to competitors. Spot the impact of content changes and market shifts.",
		graphic: <VisibilityTrendGraphic />,
	},
];

export function Features({ as: Heading = "h2" }: { as?: "h1" | "h2" } = {}) {
	return (
		<section id="features" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<div>
					<Heading className="text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
						All you need to grow AI visibility.
					</Heading>
				</div>

				<div className="mt-16 space-y-16 lg:space-y-24">
					{features.map((f) => (
						<div key={f.title} className="grid gap-6 lg:grid-cols-12 lg:gap-12">
							<div className="lg:col-span-5">
								<h3 className="max-w-[20ch] text-2xl font-semibold leading-[1.15] tracking-tight text-balance text-zinc-950 md:text-3xl">
									{f.title}
								</h3>
								<p className="mt-4 max-w-[52ch] text-pretty text-zinc-600 md:text-base/7">{f.description}</p>
							</div>
							<div className="lg:col-span-7">{f.graphic}</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
