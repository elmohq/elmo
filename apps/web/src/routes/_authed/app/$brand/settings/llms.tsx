/**
 * /app/$brand/settings/llms - LLM configuration page
 *
 * Shows every model the worker is configured to dispatch (from SCRAPE_TARGETS)
 * and lets brand admins opt in/out per model via brand.enabledModels.
 *
 * brand.enabledModels semantics (matches selectTargetsForBrand in
 * packages/lib/src/providers/runner.ts):
 *   - null        → no override, every configured target runs
 *   - []          → explicit opt-out, nothing runs for this brand
 *   - [model,...] → opt-in list; entries must be in current SCRAPE_TARGETS
 */
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { IconInfoCircle, IconCpu } from "@tabler/icons-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { SiOpenai, SiAnthropic, SiGoogle, SiPerplexity, SiX } from "react-icons/si";
import { useBrand, brandKeys } from "@/hooks/use-brands";
import { getProviderStatusFn, type ProviderStatus } from "@/server/admin";
import { updateBrandEnabledModelsFn } from "@/server/brands";
import { getModelMeta, type ModelConfig } from "@workspace/lib/providers";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const ICON_BY_ID: Record<string, IconComponent> = {
	openai: SiOpenai,
	anthropic: SiAnthropic,
	google: SiGoogle,
	perplexity: SiPerplexity,
	x: SiX,
};

function ModelIcon({ iconId, className }: { iconId: string; className?: string }) {
	const Icon = ICON_BY_ID[iconId];
	if (Icon) return <Icon className={className} />;
	return <IconCpu className={className} />;
}

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
	const { brand, isLoading: brandLoading, revalidate } = useBrand();
	const queryClient = useQueryClient();

	const [status, setStatus] = useState<ProviderStatus | null>(null);
	const [statusError, setStatusError] = useState<string | null>(null);
	const [statusLoading, setStatusLoading] = useState(true);

	useEffect(() => {
		getProviderStatusFn()
			.then(setStatus)
			.catch((err) => setStatusError(err instanceof Error ? err.message : "Failed to load providers"))
			.finally(() => setStatusLoading(false));
	}, []);

	const activeTargets = status?.activeTargets ?? [];
	const activeModels = useMemo(() => new Set(activeTargets.map((t) => t.model)), [activeTargets]);

	const persistedEnabled: string[] | null = brand?.enabledModels ?? null;

	// Seed the toggle state from the brand. null (no override) surfaces as "all
	// currently-active models selected" so the grid is in a consistent shape;
	// saving that state sends back the full array, which the worker enforces.
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [selectionInitialized, setSelectionInitialized] = useState(false);

	useEffect(() => {
		if (!brand || statusLoading) return;
		if (persistedEnabled === null) {
			setSelected(new Set(activeTargets.map((t) => t.model)));
		} else {
			setSelected(new Set(persistedEnabled.filter((m) => activeModels.has(m))));
		}
		setSelectionInitialized(true);
	}, [brand?.updatedAt, statusLoading, status]);

	const orphaned = useMemo(() => {
		if (!persistedEnabled) return [];
		return persistedEnabled.filter((m) => !activeModels.has(m));
	}, [persistedEnabled, activeModels]);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

	const toggle = (model: string) => {
		setSaveError(null);
		setSaveSuccess(null);
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(model)) next.delete(model);
			else next.add(model);
			return next;
		});
	};

	const persistArray = async (value: string[] | null) => {
		if (!brand) return;
		setIsSubmitting(true);
		setSaveError(null);
		setSaveSuccess(null);
		try {
			await updateBrandEnabledModelsFn({ data: { brandId: brand.id, enabledModels: value } });
			queryClient.invalidateQueries({ queryKey: brandKeys.detail(brand.id) });
			await revalidate();
			setSaveSuccess(
				value === null
					? "Reset to default. Every configured model will run."
					: value.length === 0
						? "Saved. No models will run for this brand until you enable one."
						: `Saved. ${value.length} model${value.length === 1 ? "" : "s"} enabled.`,
			);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSave = () => persistArray([...selected]);
	const handleResetDefault = () => persistArray(null);

	if (brandLoading || statusLoading || !selectionInitialized) {
		return (
			<div className="space-y-6 max-w-6xl">
				<div className="space-y-2">
					<Skeleton className="h-8 w-32" />
					<Skeleton className="h-4 w-80" />
				</div>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[0, 1, 2].map((n) => (
						<Skeleton key={n} className="h-48" />
					))}
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-destructive">Brand not found</p>
			</div>
		);
	}

	if (statusError || !status) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">LLMs</h1>
				<Alert variant="destructive">
					<AlertDescription>{statusError ?? "Failed to load provider status"}</AlertDescription>
				</Alert>
			</div>
		);
	}

	const nothingSelected = selected.size === 0;
	const usingDefault = persistedEnabled === null;

	return (
		<div className="space-y-6 max-w-6xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Your prompts are evaluated against multiple AI models to track how your brand appears across different types of AI
					search. Toggle off any model you don't want included in runs for this brand.
				</p>
			</div>

			{activeTargets.length === 0 && (
				<Alert>
					<AlertDescription>
						No models are configured for this deployment. Ask an admin to set{" "}
						<code className="text-xs">SCRAPE_TARGETS</code>.
					</AlertDescription>
				</Alert>
			)}

			{orphaned.length > 0 && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						The following saved models are no longer in this deployment's{" "}
						<code className="text-xs">SCRAPE_TARGETS</code> and will cause the worker to throw on next dispatch:{" "}
						<strong>{orphaned.join(", ")}</strong>. Click Save to drop them.
					</AlertDescription>
				</Alert>
			)}

			{nothingSelected && activeTargets.length > 0 && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						No models are selected. If you save now, prompts will stop running for this brand until a model is re-enabled.
					</AlertDescription>
				</Alert>
			)}

			{activeTargets.length > 0 && (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{activeTargets.map((cfg) => (
						<ModelCard
							key={`${cfg.model}:${cfg.provider}`}
							config={cfg}
							enabled={selected.has(cfg.model)}
							onToggle={() => toggle(cfg.model)}
						/>
					))}
				</div>
			)}

			<div className="flex items-center gap-3 pt-2">
				<Button onClick={handleSave} disabled={isSubmitting} className="cursor-pointer">
					{isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
					Save
				</Button>
				{!usingDefault && (
					<Button variant="outline" onClick={handleResetDefault} disabled={isSubmitting} className="cursor-pointer">
						Reset to default (all models)
					</Button>
				)}
				{usingDefault && (
					<p className="text-xs text-muted-foreground">
						Using deployment default — every configured model runs. Toggle any card off to start an opt-in list.
					</p>
				)}
				{saveSuccess && <p className="text-sm text-emerald-600">{saveSuccess}</p>}
				{saveError && <p className="text-sm text-red-600">{saveError}</p>}
			</div>
		</div>
	);
}

function ModelCard({
	config,
	enabled,
	onToggle,
}: {
	config: ModelConfig;
	enabled: boolean;
	onToggle: () => void;
}) {
	const meta = getModelMeta(config.model);
	const checkboxId = `llm-toggle-${config.model}`;
	return (
		<Card className={`h-full ${enabled ? "" : "opacity-60"}`}>
			<CardHeader className="py-2 border-b">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-3">
						<ModelIcon iconId={meta.iconId} className="h-6 w-6" />
						<div className="flex flex-col">
							<span className="font-medium">{meta.label}</span>
							<code className="text-[10px] text-muted-foreground">{config.model}</code>
						</div>
					</div>
					<label htmlFor={checkboxId} className="flex items-center gap-2 cursor-pointer">
						<span className="text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
						<Checkbox id={checkboxId} checked={enabled} onCheckedChange={onToggle} />
					</label>
				</div>
			</CardHeader>
			<CardContent className="pt-2">
				<div className="divide-y text-sm">
					<div className="flex items-center justify-between py-2">
						<span className="text-xs uppercase tracking-wide text-muted-foreground">Provider</span>
						<span className="text-xs font-mono text-foreground">{config.provider}</span>
					</div>
					<div className="flex items-center justify-between py-2">
						<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
							<span>Version</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-xs font-normal">
									Exact version slug passed to the provider when this model runs.
								</TooltipContent>
							</Tooltip>
						</div>
						<span className="font-mono text-xs text-foreground">{config.version ?? "—"}</span>
					</div>
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
						<span className="text-xs text-foreground">{config.webSearch ? "Enabled" : "Disabled"}</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
