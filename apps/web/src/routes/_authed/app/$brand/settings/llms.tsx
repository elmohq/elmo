/**
 * /app/$brand/settings/llms - LLM configuration page
 *
 * Lists the AI models this brand is tracked against, data-driven from the
 * deployment's `SCRAPE_TARGETS` + `brand.enabledModels`. Each card renders
 * from `brand.effectiveModelConfigs` rather than a hardcoded model list so
 * any deployment-configured model shows up automatically.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { IconCircleCheck, IconCircleX, IconInfoCircle } from "@tabler/icons-react";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useBrand } from "@/hooks/use-brands";
import { iconForModel, labelForModel, publisherForModel } from "@/components/filter-bar";

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
	const { brand, isLoading } = useBrand();
	const configs = brand?.effectiveModelConfigs ?? [];

	return (
		<div className="space-y-6 max-w-6xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Your prompts are evaluated against these AI models to track how your brand appears across different types of AI
					search.
				</p>
			</div>

			{isLoading && !brand ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<Card key={i} className="h-full">
							<CardHeader className="py-2 border-b">
								<Skeleton className="h-6 w-6 rounded" />
							</CardHeader>
							<CardContent className="pt-2 space-y-2">
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-4 w-2/3" />
							</CardContent>
						</Card>
					))}
				</div>
			) : configs.length === 0 ? (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						No models are configured for this brand. Set <code className="font-mono text-xs">SCRAPE_TARGETS</code> at the
						deployment level, or adjust this brand&apos;s <code className="font-mono text-xs">enabledModels</code>.
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{configs.map((config) => (
						<Card key={config.model} className="h-full">
							<CardHeader className="py-2 border-b">
								<div className="flex items-center gap-3">
									{iconForModel(config.model, "h-6 w-6")}
									<span className="font-medium">{labelForModel(config.model)}</span>
								</div>
							</CardHeader>
							<CardContent className="pt-2">
								<div className="divide-y text-sm">
									<div className="flex items-center justify-between py-2">
										<span className="text-xs uppercase tracking-wide text-muted-foreground">Provider</span>
										<span className="text-xs text-foreground">{publisherForModel(config.model)}</span>
									</div>
									{config.version && (
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
											<span className="font-mono text-xs text-foreground">{config.version}</span>
										</div>
									)}
									<div className="flex items-center justify-between py-2">
										<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
											<span>Web search</span>
											<Tooltip>
												<TooltipTrigger asChild>
													<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
												</TooltipTrigger>
												<TooltipContent className="max-w-xs text-xs font-normal">
													{config.webSearch
														? "Responses include real-time information from the web."
														: "Responses are based on the model's training data only."}
												</TooltipContent>
											</Tooltip>
										</div>
										<div className="flex items-center gap-2 text-xs text-foreground">
											{config.webSearch ? (
												<IconCircleCheck className="h-4 w-4 text-emerald-600" />
											) : (
												<IconCircleX className="h-4 w-4 text-red-600" />
											)}
											<span className="sr-only">{config.webSearch ? "Enabled" : "Disabled"}</span>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
