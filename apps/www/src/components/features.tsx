import { Badge } from "@workspace/ui/components/badge";
import {
	OverviewPageGraphic,
	VisibilityPageGraphic,
	CitationsPageGraphic,
	PromptSearchGraphic,
	CompetitorGraphic,
	PromptDetailGraphic,
	VisibilityTrendGraphic,
} from "./feature-graphics";

interface Feature {
	badge: string;
	title: string;
	description: string;
	graphic: React.ReactNode;
}

const features: Feature[] = [
	{
		badge: "Dashboard",
		title: "Your AI visibility command center",
		description:
			"See everything at a glance — current visibility score, 30-day trends, citation category breakdowns, and key metrics like prompts tracked, evaluations, and run frequency.",
		graphic: <OverviewPageGraphic />,
	},
	{
		badge: "Visibility Tracking",
		title: "Track visibility across every prompt and model",
		description:
			"Filter by AI model, time range, and tags. See per-prompt visibility scores with trend lines comparing your brand against competitors, all in a fast virtualized list.",
		graphic: <VisibilityPageGraphic />,
	},
	{
		badge: "Citation Analysis",
		title: "Understand where AI gets its information",
		description:
			"See which domains and URLs AI models cite most, track new and dropped sources over time, and break down citations by category — brand, competitor, social, and more.",
		graphic: <CitationsPageGraphic />,
	},
	{
		badge: "Prompt Intelligence",
		title: "Search, tag, and organize your prompts",
		description:
			"Find any prompt instantly with full-text search and highlight matching. Tag prompts for easy filtering and track visibility scores per prompt.",
		graphic: <PromptSearchGraphic />,
	},
	{
		badge: "Brand vs Competitors",
		title: "See how you stack up against the competition",
		description:
			"Compare your brand's AI mention rate against competitors. Understand who dominates which prompts and identify gaps in your AI visibility.",
		graphic: <CompetitorGraphic />,
	},
	{
		badge: "Prompt Deep Dive",
		title: "Inspect every individual AI response",
		description:
			"Drill into any prompt to see exactly what each AI model said, which brands were mentioned, what sources were cited, and how the response was constructed.",
		graphic: <PromptDetailGraphic />,
	},
	{
		badge: "Trend Analysis",
		title: "Track visibility trends over months",
		description:
			"Watch how your brand's AI visibility changes over time compared to competitors. Spot the impact of content changes and market shifts.",
		graphic: <VisibilityTrendGraphic />,
	},
];

export function Features() {
	return (
		<section id="features" className="py-12 lg:py-20">
			<div className="mx-auto max-w-7xl px-4 md:px-6">
				<header className="mx-auto mb-16 max-w-2xl text-center lg:mb-24">
					<Badge variant="outline" className="text-primary">
						Features
					</Badge>
					<h2 className="font-heading mt-4 text-4xl sm:text-5xl lg:text-balance">
						Everything you need for AI visibility
					</h2>
					<p className="text-muted-foreground mt-6 text-lg">
						A complete toolkit to understand and improve how AI search engines
						represent your brand.
					</p>
				</header>

				<div className="space-y-20 lg:space-y-32">
					{features.map((feature, i) => {
						const reversed = i % 2 === 1;
						return (
							<div
								key={feature.badge}
								className={`flex flex-col items-center gap-8 lg:flex-row lg:gap-16 ${
									reversed ? "lg:flex-row-reverse" : ""
								}`}
							>
								<div className="w-full lg:w-1/2">
									{feature.graphic}
								</div>
								<div className="w-full lg:w-1/2">
									<Badge variant="outline" className="text-primary mb-3">
										{feature.badge}
									</Badge>
									<h3 className="font-heading text-2xl lg:text-3xl">
										{feature.title}
									</h3>
									<p className="text-muted-foreground mt-3 text-base/7 lg:text-lg/8">
										{feature.description}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
