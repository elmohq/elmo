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
import { iconForModel } from "@/components/filter-bar";
import * as m from "@/paraglide/messages.js";

export const Route = createFileRoute("/_authed/app/$brand/settings/llms")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle(m.settings_llms_title(), { appName, brandName }) },
				{ name: "description", content: m.settings_llms_meta_description() },
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
				<h1 className="text-3xl font-bold">{m.settings_llms_title()}</h1>
				<p className="text-muted-foreground">
					{m.settings_llms_description()}
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
						{m.settings_llms_none()}
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{configs.map((config) => (
						<Card key={config.model} className="h-full">
							<CardHeader className="py-2 border-b">{iconForModel(config.model, "h-6 w-6")}</CardHeader>
							<CardContent className="pt-2">
								<div className="divide-y text-sm">
					<ConfigRow label={m.settings_llms_model()} tooltip={m.settings_llms_model_tip()}>
										<span className="font-mono text-xs text-foreground">{config.model}</span>
									</ConfigRow>
									<ConfigRow
										label={m.settings_llms_provider()}
										tooltip={m.settings_llms_provider_tip()}
									>
										<span className="font-mono text-xs text-foreground">{config.provider}</span>
									</ConfigRow>
									<ConfigRow label={m.settings_llms_version()} tooltip={m.settings_llms_version_tip()}>
										<span className="font-mono text-xs text-foreground">{config.version ?? "—"}</span>
									</ConfigRow>
									<ConfigRow label={m.settings_llms_web_search()} tooltip={m.settings_llms_web_search_tip()}>
										{config.webSearch ? (
											<IconCircleCheck className="h-4 w-4 text-emerald-600" />
										) : (
											<IconCircleX className="h-4 w-4 text-muted-foreground" />
										)}
										<span className="sr-only">{config.webSearch ? m.common_enabled() : m.common_disabled()}</span>
									</ConfigRow>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}

function ConfigRow({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between py-2">
			<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
				<span>{label}</span>
				{tooltip && (
					<Tooltip>
						<TooltipTrigger asChild>
							<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-xs font-normal">{tooltip}</TooltipContent>
					</Tooltip>
				)}
			</div>
			<div className="flex items-center gap-2">{children}</div>
		</div>
	);
}
