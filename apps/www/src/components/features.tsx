import {
	OverviewPageGraphic,
	VisibilityPageGraphic,
	ShareOfVoicePageGraphic,
	QueryFanOutPageGraphic,
	CitationsPageGraphic,
	OpportunitiesPageGraphic,
	PromptSearchGraphic,
	PromptDetailGraphic,
	VisibilityTrendGraphic,
} from "./feature-graphics";

interface Feature {
	num: string;
	eyebrow: string;
	title: string;
	description: string;
	graphic: React.ReactNode;
}

const features: Feature[] = [
	{
		num: "01",
		eyebrow: "DASHBOARD",
		title: "Start with the questions that shape a buyer's shortlist.",
		description:
			"See current visibility, share of voice, and 30-day trends, then open the prompt and model data behind each score.",
		graphic: <OverviewPageGraphic />,
	},
	{
		num: "02",
		eyebrow: "VISIBILITY",
		title: "Find the prompts where competitors replace you.",
		description:
			"Filter by model, time range, and tag. Compare your visibility against named competitors for each tracked question.",
		graphic: <VisibilityPageGraphic />,
	},
	{
		num: "03",
		eyebrow: "SHARE OF VOICE",
		title: "See which brands AI names when buyers compare options.",
		description:
			"Compare mention share against every competitor. The leaderboard shows the categories where your brand appears and the ones rivals own.",
		graphic: <ShareOfVoicePageGraphic />,
	},
	{
		num: "04",
		eyebrow: "QUERY FAN-OUT",
		title: "See the web searches behind every AI answer.",
		description:
			"Follow the queries and keywords an engine generates from a single prompt, including the way it rewrites the original question.",
		graphic: <QueryFanOutPageGraphic />,
	},
	{
		num: "05",
		eyebrow: "CITATIONS",
		title: "See which sources an answer relies on.",
		description:
			"Track cited domains and URLs over time, including new and dropped sources, then separate brand, competitor, social, and other citations.",
		graphic: <CitationsPageGraphic />,
	},
	{
		num: "06",
		eyebrow: "OPPORTUNITIES",
		title: "Choose the next page or placement to pursue.",
		description:
			"Review ranked recommendations for content to create, pages to refresh, and third-party sources to pitch, tied to the gaps in your tracked answers.",
		graphic: <OpportunitiesPageGraphic />,
	},
	{
		num: "07",
		eyebrow: "PROMPTS",
		title: "Keep every tracked question tied to a topic or campaign.",
		description:
			"Search prompt text, tag questions for filtering, and track visibility for each prompt instead of losing the context in one blended score.",
		graphic: <PromptSearchGraphic />,
	},
	{
		num: "08",
		eyebrow: "DEEP DIVE",
		title: "Read the response before you act on the score.",
		description:
			"Open any prompt to read each model response, see the brands it mentioned, and review the sources it cited.",
		graphic: <PromptDetailGraphic />,
	},
	{
		num: "09",
		eyebrow: "TRENDS",
		title: "See whether your work changes how AI names you.",
		description:
			"Compare your visibility over time with competitors to spot changes after content work and shifts in the market.",
		graphic: <VisibilityTrendGraphic />,
	},
];

export function Features() {
	return (
		<section id="features" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ FEATURES</p>
					<h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
						Turn AI-answer gaps into the next move.
					</h2>
				</div>

				<div className="mt-16 space-y-16 lg:space-y-24">
					{features.map((f) => (
						<div key={f.num} className="grid gap-6 lg:grid-cols-12 lg:gap-12">
							<div className="lg:col-span-5">
								<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
									<span className="text-blue-600 tabular-nums">{f.num}</span>
									<span className="mx-2 text-zinc-300">/</span>
									{f.eyebrow}
								</p>
								<h3 className="mt-5 max-w-[20ch] text-2xl font-semibold leading-[1.15] tracking-tight text-balance text-zinc-950 md:text-3xl">
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
