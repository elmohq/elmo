/**
 * /app/$brand/settings/llms - LLM configuration page
 *
 * Shows info about tracked LLMs and their web search status.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { IconCircleCheck, IconCircleX, IconInfoCircle } from "@tabler/icons-react";
import { SiOpenai, SiAnthropic, SiGoogle } from "react-icons/si";

interface ModelGroupInfo {
	id: string;
	name: string;
	provider: string;
	currentModel: string;
	description: string;
	icon: React.ReactNode;
	trackedEnabled: boolean;
	webSearchEnabled: boolean;
	webSearchStatus: string;
	webSearchDetail: string;
}

const MODEL_GROUPS: ModelGroupInfo[] = [
	{
		id: "openai",
		name: "ChatGPT",
		provider: "OpenAI",
		currentModel: "gpt-5-mini",
		description:
			"ChatGPT is OpenAI's consumer assistant, and it's often the first place people turn for product recommendations and comparisons. Tracking visibility here shows how your brand appears in everyday ChatGPT responses.",
		icon: <SiOpenai className="h-6 w-6" />,
		trackedEnabled: true,
		webSearchEnabled: true,
		webSearchStatus: "Enabled",
		webSearchDetail:
			"Responses include real-time information from the web, making visibility here especially impactful for brand discovery.",
	},
	{
		id: "anthropic",
		name: "Claude",
		provider: "Anthropic",
		currentModel: "claude-sonnet-4-20250514",
		description:
			"Claude is Anthropic's assistant and is popular with professionals for nuanced, long-form research. Tracking Claude highlights how your brand appears in deeper analysis and decision making.",
		icon: <SiAnthropic className="h-6 w-6" />,
		trackedEnabled: true,
		webSearchEnabled: false,
		webSearchStatus: "Disabled",
		webSearchDetail:
			"Responses are based on Claude's training data. Brand mentions reflect how well your brand is represented in publicly available content.",
	},
	{
		id: "google",
		name: "Google AI Overviews",
		provider: "Google",
		currentModel: "AI Mode",
		description:
			"Google AI Mode powers AI Overviews in Search. Tracking AI Mode shows how your brand is summarized and cited as Google blends AI answers with traditional results.",
		icon: <SiGoogle className="h-6 w-6" />,
		trackedEnabled: true,
		webSearchEnabled: true,
		webSearchStatus: "Enabled",
		webSearchDetail:
			"Always uses live web data — results reflect real-time Google Search content, including your website, reviews, and mentions across the web.",
	},
];

export const Route = createFileRoute("/_authed/app/$brand/settings/llms")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("LLMs", { appName, brandName }) },
				{ name: "description", content: "View tracked AI models and configuration." },
			],
		};
	},
	component: LlmsSettingsPage,
});

function LlmsSettingsPage() {
	return (
		<div className="space-y-6 max-w-6xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Your prompts are evaluated against multiple types of AI models to track how your brand appears across different
					types of AI search.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{MODEL_GROUPS.map((group) => (
					<Card key={group.id} className="h-full">
						<CardHeader className="py-2 border-b">
							<div className="flex items-start justify-between gap-2">
								<div className="flex items-start gap-3">
									<div className="flex items-center justify-center">{group.icon}</div>
								</div>
							</div>
						</CardHeader>
						<CardContent className="pt-2">
							<div className="divide-y text-sm">
								<div className="flex items-center justify-between py-2">
									<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
										<span>Provider</span>
									</div>
									<span className="text-xs text-foreground">{group.provider}</span>
								</div>
								<div className="flex items-center justify-between py-2">
									<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
										<span>Model</span>
										<Tooltip>
											<TooltipTrigger asChild>
												<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs text-xs font-normal">
												Exact model version used for this group.
											</TooltipContent>
										</Tooltip>
									</div>
									<span className="font-mono text-xs text-foreground">{group.currentModel}</span>
								</div>
								<div className="flex items-center justify-between py-2">
									<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
										<span>Tracked</span>
										<Tooltip>
											<TooltipTrigger asChild>
												<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs text-xs font-normal">
												Whether this model group is included in your visibility runs.
											</TooltipContent>
										</Tooltip>
									</div>
									<div className="flex items-center gap-2 text-xs text-foreground">
										{group.trackedEnabled ? (
											<IconCircleCheck className="h-4 w-4 text-emerald-600" />
										) : (
											<IconCircleX className="h-4 w-4 text-red-600" />
										)}
										<span className="sr-only">{group.trackedEnabled ? "Enabled" : "Disabled"}</span>
									</div>
								</div>
								<div className="flex items-center justify-between py-2">
									<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
										<span>Web search</span>
										<Tooltip>
											<TooltipTrigger asChild>
												<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs text-xs font-normal">
												{group.webSearchDetail}
											</TooltipContent>
										</Tooltip>
									</div>
									<div className="flex items-center gap-2 text-xs text-foreground">
										{group.webSearchEnabled ? (
											<IconCircleCheck className="h-4 w-4 text-emerald-600" />
										) : (
											<IconCircleX className="h-4 w-4 text-red-600" />
										)}
										<span className="sr-only">{group.webSearchStatus}</span>
									</div>
								</div>
							</div>
						</CardContent>
						<CardFooter className="pt-2 border-t">
							<CardDescription className="text-xs text-muted-foreground">{group.description}</CardDescription>
						</CardFooter>
					</Card>
				))}
			</div>
		</div>
	);
}
