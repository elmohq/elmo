/**
 * /app/$brand/settings/llms - LLM configuration page
 *
 * Shows dynamically configured AI engines from SCRAPE_TARGETS and lets
 * brand admins toggle individual engines on/off via brands.enabledEngines.
 */
import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Badge } from "@workspace/ui/components/badge";
import { IconCircleCheck, IconCircleX, IconInfoCircle, IconRobot } from "@tabler/icons-react";
import { SiOpenai, SiAnthropic, SiGoogle, SiPerplexity, SiX } from "react-icons/si";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseScrapeTargets, getEngineMeta } from "@workspace/lib/providers";

// ============================================================================
// Server functions
// ============================================================================

const getEngineConfigFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const engineConfigs = parseScrapeTargets(process.env.SCRAPE_TARGETS);
		const activeEngines = engineConfigs.map((cfg) => {
			const meta = getEngineMeta(cfg.engine);
			return {
				engine: cfg.engine,
				provider: cfg.provider,
				model: cfg.model ?? null,
				webSearch: cfg.webSearch,
				label: meta.label,
				iconId: meta.iconId,
			};
		});

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, data.brandId),
			columns: { enabledEngines: true },
		});

		return {
			engines: activeEngines,
			enabledEngines: brand?.enabledEngines ?? null,
		};
	});

const updateBrandEnabledEnginesFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			enabledEngines: z.array(z.string()).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const result = await db
			.update(brands)
			.set({ enabledEngines: data.enabledEngines, updatedAt: new Date() })
			.where(eq(brands.id, data.brandId))
			.returning({ enabledEngines: brands.enabledEngines });

		if (!result[0]) throw new Error("Brand not found");
		return { enabledEngines: result[0].enabledEngines };
	});

// ============================================================================
// Icon mapping
// ============================================================================

function getEngineIcon(iconId: string) {
	switch (iconId) {
		case "openai":
			return <SiOpenai className="h-6 w-6" />;
		case "anthropic":
			return <SiAnthropic className="h-6 w-6" />;
		case "google":
			return <SiGoogle className="h-6 w-6" />;
		case "perplexity":
			return <SiPerplexity className="h-6 w-6" />;
		case "x":
			return <SiX className="h-6 w-6" />;
		default:
			return <IconRobot className="h-6 w-6" />;
	}
}

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/_authed/app/$brand/settings/llms")({
	loader: async ({ params }) => {
		return getEngineConfigFn({ data: { brandId: params.brand } });
	},
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

// ============================================================================
// Page component
// ============================================================================

function LlmsSettingsPage() {
	const { engines, enabledEngines: initialEnabledEngines } = Route.useLoaderData();
	const { brand: brandId } = Route.useParams();

	const [enabledEngines, setEnabledEngines] = useState<string[] | null>(initialEnabledEngines);
	const [saving, setSaving] = useState(false);

	const isEngineEnabled = useCallback(
		(engine: string) => {
			if (enabledEngines === null) return true;
			return enabledEngines.includes(engine);
		},
		[enabledEngines],
	);

	const handleToggle = useCallback(
		async (engine: string, checked: boolean) => {
			const allEngineIds = engines.map((e) => e.engine);
			let next: string[];

			if (enabledEngines === null) {
				next = checked ? allEngineIds : allEngineIds.filter((e) => e !== engine);
			} else {
				next = checked ? [...enabledEngines, engine] : enabledEngines.filter((e) => e !== engine);
			}

			const isAllEnabled = allEngineIds.every((e) => next.includes(e));
			const newValue = isAllEnabled ? null : next;

			setEnabledEngines(newValue);
			setSaving(true);
			try {
				await updateBrandEnabledEnginesFn({
					data: { brandId, enabledEngines: newValue },
				});
			} finally {
				setSaving(false);
			}
		},
		[enabledEngines, engines, brandId],
	);

	return (
		<div className="space-y-6 max-w-6xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Your prompts are evaluated against the AI engines configured for this instance. Instance-level
					configuration (which engines, providers, and models) is set via the{" "}
					<code className="text-xs bg-muted px-1 py-0.5 rounded">SCRAPE_TARGETS</code> environment variable.
					You can toggle individual engines on or off for this brand below.
				</p>
			</div>

			{engines.length === 0 ? (
				<Card>
					<CardContent className="py-8 text-center text-muted-foreground">
						No engines configured. Set the <code className="text-xs bg-muted px-1 py-0.5 rounded">SCRAPE_TARGETS</code>{" "}
						environment variable to add engines.
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{engines.map((engine) => {
						const enabled = isEngineEnabled(engine.engine);
						return (
							<Card key={engine.engine} className={`h-full transition-opacity ${enabled ? "" : "opacity-60"}`}>
								<CardHeader className="py-2 border-b">
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-center gap-3">
											<div className="flex items-center justify-center">{getEngineIcon(engine.iconId)}</div>
											<span className="font-semibold text-sm">{engine.label}</span>
										</div>
										<Checkbox
											checked={enabled}
											disabled={saving}
											onCheckedChange={(checked) => handleToggle(engine.engine, !!checked)}
											aria-label={`Toggle ${engine.label}`}
										/>
									</div>
								</CardHeader>
								<CardContent className="pt-2">
									<div className="divide-y text-sm">
										<div className="flex items-center justify-between py-2">
											<span className="text-xs uppercase tracking-wide text-muted-foreground">Provider</span>
											<span className="text-xs text-foreground">{engine.provider}</span>
										</div>
										{engine.model && (
											<div className="flex items-center justify-between py-2">
												<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
													<span>Model</span>
													<Tooltip>
														<TooltipTrigger asChild>
															<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
														</TooltipTrigger>
														<TooltipContent className="max-w-xs text-xs font-normal">
															Exact model slug used for this engine.
														</TooltipContent>
													</Tooltip>
												</div>
												<span className="font-mono text-xs text-foreground">{engine.model}</span>
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
														Whether this engine uses real-time web search when generating responses.
													</TooltipContent>
												</Tooltip>
											</div>
											<div className="flex items-center gap-2 text-xs text-foreground">
												{engine.webSearch ? (
													<IconCircleCheck className="h-4 w-4 text-emerald-600" />
												) : (
													<IconCircleX className="h-4 w-4 text-red-600" />
												)}
												<span className="sr-only">{engine.webSearch ? "Enabled" : "Disabled"}</span>
											</div>
										</div>
									</div>
								</CardContent>
								<CardFooter className="pt-2 border-t">
									<div className="flex items-center gap-2">
										<Badge variant={enabled ? "default" : "secondary"} className="text-xs">
											{enabled ? "Enabled" : "Disabled"}
										</Badge>
									</div>
								</CardFooter>
							</Card>
						);
					})}
				</div>
			)}
		</div>
	);
}
