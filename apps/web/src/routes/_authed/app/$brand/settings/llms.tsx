import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { IconCircleCheck, IconCircleX, IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { iconForModel } from "@/components/filter-bar";
import { useBrand } from "@/hooks/use-brands";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import {
	createEvaluationTargetFn,
	getBrandEvaluationConfigFn,
	updateBrandEvaluationConfigFn,
} from "@/server/evaluation-config";

type Target = {
	id: string;
	model: string;
	provider: string;
	version: string | null;
	webSearch: boolean;
	enabled: boolean;
	requiresPromptAssignment: boolean;
	defaultCadenceHours: number;
	defaultSamplesPerDispatch: number;
};

type ScopeConfig = {
	targetId: string | null;
	scope: "organization" | "brand" | "prompt";
	enabled: boolean | null;
	cadenceHours: number | null;
	samplesPerDispatch: number | null;
};

export const Route = createFileRoute("/_authed/app/$brand/settings/llms")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("LLMs", { appName, brandName }) },
				{ name: "description", content: "View and configure tracked AI models." },
			],
		};
	},
	component: LlmsSettingsPage,
});

function LlmsSettingsPage() {
	const { brand, brandId, isLoading, revalidate } = useBrand();
	const queryClient = useQueryClient();
	const [error, setError] = useState("");
	const [addingTarget, setAddingTarget] = useState(false);
	const evaluationConfig = useQuery({
		queryKey: ["evaluation-config", brandId],
		queryFn: () => getBrandEvaluationConfigFn({ data: { brandId: brandId! } }),
		enabled: Boolean(brandId),
	});

	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: ["evaluation-config", brandId] });
		await revalidate();
	};

	const updateBrandTarget = async (
		targetId: string,
		patch: { enabled?: boolean | null; cadenceHours?: number | null; samplesPerDispatch?: number | null },
	) => {
		setError("");
		try {
			await updateBrandEvaluationConfigFn({ data: { brandId: brandId!, targetId, ...patch } });
			await refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not update evaluation configuration");
		}
	};

	const addTarget = async (formData: FormData) => {
		setError("");
		setAddingTarget(true);
		try {
			await createEvaluationTargetFn({
				data: {
					model: String(formData.get("model") ?? "").trim(),
					provider: String(formData.get("provider") ?? "").trim(),
					version: String(formData.get("version") ?? "").trim() || null,
					webSearch: formData.get("webSearch") === "on",
					defaultCadenceHours: Number(formData.get("cadenceHours")),
					defaultSamplesPerDispatch: Number(formData.get("samplesPerDispatch")),
				},
			});
			await refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Could not add evaluation target");
		} finally {
			setAddingTarget(false);
		}
	};

	if (isLoading || evaluationConfig.isLoading) {
		return <LoadingState />;
	}

	if (!brand || !evaluationConfig.data) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-destructive">LLM configuration could not be loaded.</p>
			</div>
		);
	}

	const config = evaluationConfig.data;
	const effectiveTargetIds = new Set(config.effectiveTargets.map((target) => target.targetId));
	const configuredTargets: Target[] =
		config.targets.length > 0
			? config.targets
			: config.effectiveTargets.map((target) => ({
					id: target.targetId,
					model: target.model,
					provider: target.provider,
					version: target.version ?? null,
					webSearch: target.webSearch,
					enabled: true,
					requiresPromptAssignment: false,
					defaultCadenceHours: target.cadenceHours,
					defaultSamplesPerDispatch: target.samplesPerDispatch,
				}));
	const visibleTargets =
		config.mode === "whitelabel" && !config.canManageBrandTargets
			? configuredTargets.filter((target) => effectiveTargetIds.has(target.id))
			: configuredTargets;
	const brandConfigs = new Map(
		config.scopeConfigs
			.filter((scopeConfig) => scopeConfig.scope === "brand")
			.map((scopeConfig) => [scopeConfig.targetId, scopeConfig]),
	);

	return (
		<div className="space-y-6 max-w-6xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Your prompts are evaluated against these AI models to track how your brand appears across different types of
					AI search.
				</p>
			</div>

			{error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

			{config.canManageInstance && (
				<Card>
					<CardContent className="pt-6">
						<h2 className="font-semibold">Add an instance target</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							Credentials stay in the deployment environment for this migration path. Add the provider credential first,
							then choose the model here.
						</p>
						<form className="mt-4 grid gap-3 md:grid-cols-3" action={addTarget}>
							<div className="space-y-1.5">
								<Label htmlFor="model">Model</Label>
								<Input id="model" name="model" placeholder="chatgpt" required disabled={addingTarget} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="provider">Provider</Label>
								<Input id="provider" name="provider" placeholder="brightdata" required disabled={addingTarget} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="version">Version</Label>
								<Input id="version" name="version" placeholder="Optional provider version" disabled={addingTarget} />
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="cadenceHours">Cadence (hours)</Label>
								<Input
									id="cadenceHours"
									name="cadenceHours"
									type="number"
									min="1"
									defaultValue="24"
									required
									disabled={addingTarget}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="samplesPerDispatch">Samples per run</Label>
								<Input
									id="samplesPerDispatch"
									name="samplesPerDispatch"
									type="number"
									min="1"
									defaultValue="5"
									required
									disabled={addingTarget}
								/>
							</div>
							<label className="flex items-center gap-2 self-end pb-2 text-sm">
								<input name="webSearch" type="checkbox" />
								Use web search
							</label>
							<div className="md:col-span-3">
								<Button type="submit" disabled={addingTarget} className="cursor-pointer">
									{addingTarget ? "Adding…" : "Add target"}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			)}

			{visibleTargets.length === 0 ? (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						No models are configured for this instance. An instance administrator can add a target above.
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{visibleTargets.map((target) => (
						<TargetCard
							key={target.id}
							target={target}
							effective={effectiveTargetIds.has(target.id)}
							brandConfig={brandConfigs.get(target.id) as ScopeConfig | undefined}
							inheritedCadenceHours={resolveInheritedNumber(
								target,
								config.scopeConfigs as ScopeConfig[],
								"cadenceHours",
							)}
							inheritedSamplesPerDispatch={resolveInheritedNumber(
								target,
								config.scopeConfigs as ScopeConfig[],
								"samplesPerDispatch",
							)}
							canManageTargetSelection={config.canManageBrandTargets}
							canManageRunPolicy={config.canManageBrandRunPolicy}
							onSave={updateBrandTarget}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function resolveInheritedNumber(
	target: Target,
	configs: ScopeConfig[],
	field: "cadenceHours" | "samplesPerDispatch",
): number {
	let value = field === "cadenceHours" ? target.defaultCadenceHours : target.defaultSamplesPerDispatch;
	for (const scope of ["organization", "brand"] as const) {
		const scopeConfigs = configs.filter((config) => config.scope === scope);
		const defaultConfig = scopeConfigs.find((config) => config.targetId === null);
		const targetConfig = scopeConfigs.find((config) => config.targetId === target.id);
		const override = targetConfig?.[field] ?? defaultConfig?.[field];
		if (override !== null && override !== undefined) value = override;
	}
	return value;
}

function TargetCard({
	target,
	effective,
	brandConfig,
	inheritedCadenceHours,
	inheritedSamplesPerDispatch,
	canManageTargetSelection,
	canManageRunPolicy,
	onSave,
}: {
	target: Target;
	effective: boolean;
	brandConfig?: ScopeConfig;
	inheritedCadenceHours: number;
	inheritedSamplesPerDispatch: number;
	canManageTargetSelection: boolean;
	canManageRunPolicy: boolean;
	onSave: (
		targetId: string,
		patch: { enabled?: boolean | null; cadenceHours?: number | null; samplesPerDispatch?: number | null },
	) => Promise<void>;
}) {
	const [cadenceHours, setCadenceHours] = useState(String(inheritedCadenceHours));
	const [samplesPerDispatch, setSamplesPerDispatch] = useState(String(inheritedSamplesPerDispatch));
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setCadenceHours(String(inheritedCadenceHours));
		setSamplesPerDispatch(String(inheritedSamplesPerDispatch));
	}, [inheritedCadenceHours, inheritedSamplesPerDispatch]);

	const save = async () => {
		setSaving(true);
		try {
			await onSave(target.id, {
				cadenceHours: Number(cadenceHours),
				samplesPerDispatch: Number(samplesPerDispatch),
			});
		} finally {
			setSaving(false);
		}
	};

	const reset = async () => {
		setSaving(true);
		try {
			await onSave(target.id, { enabled: null, cadenceHours: null, samplesPerDispatch: null });
		} finally {
			setSaving(false);
		}
	};

	return (
		<Card className="h-full">
			<CardHeader className="flex-row items-center justify-between py-2 border-b">
				{iconForModel(target.model, "h-6 w-6")}
				{canManageTargetSelection && target.requiresPromptAssignment ? (
					<span className="text-xs text-muted-foreground">Prompt assignment required</span>
				) : canManageTargetSelection ? (
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Enabled</span>
						<Switch
							checked={effective}
							disabled={saving || !target.enabled}
							onCheckedChange={(enabled) => void onSave(target.id, { enabled })}
						/>
					</div>
				) : null}
			</CardHeader>
			<CardContent className="space-y-3 pt-2">
				<div className="divide-y text-sm">
					<ConfigRow label="Model" tooltip="Which AI model this target covers.">
						<span className="font-mono text-xs text-foreground">{target.model}</span>
					</ConfigRow>
					<ConfigRow label="Provider" tooltip="How this deployment reaches the model.">
						<span className="font-mono text-xs text-foreground">{target.provider}</span>
					</ConfigRow>
					<ConfigRow label="Version" tooltip="Exact upstream model version requested from the provider.">
						<span className="font-mono text-xs text-foreground">{target.version ?? "—"}</span>
					</ConfigRow>
					<ConfigRow label="Web search" tooltip="Whether web search is used for this target.">
						{target.webSearch ? (
							<IconCircleCheck className="h-4 w-4 text-emerald-600" />
						) : (
							<IconCircleX className="h-4 w-4 text-muted-foreground" />
						)}
					</ConfigRow>
				</div>

				{canManageRunPolicy && !target.requiresPromptAssignment && (
					<div className="grid grid-cols-2 gap-2 border-t pt-3">
						<div className="space-y-1">
							<Label className="text-xs" htmlFor={`cadence-${target.id}`}>
								Cadence (hours)
							</Label>
							<Input
								id={`cadence-${target.id}`}
								type="number"
								min="1"
								value={cadenceHours}
								onChange={(event) => setCadenceHours(event.target.value)}
								disabled={saving}
							/>
						</div>
						<div className="space-y-1">
							<Label className="text-xs" htmlFor={`samples-${target.id}`}>
								Samples
							</Label>
							<Input
								id={`samples-${target.id}`}
								type="number"
								min="1"
								value={samplesPerDispatch}
								onChange={(event) => setSamplesPerDispatch(event.target.value)}
								disabled={saving}
							/>
						</div>
						<div className="col-span-2 flex gap-2">
							<Button type="button" size="sm" onClick={() => void save()} disabled={saving} className="cursor-pointer">
								Save run settings
							</Button>
							{brandConfig && (
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => void reset()}
									disabled={saving}
									className="cursor-pointer"
								>
									Use inherited
								</Button>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function LoadingState() {
	return (
		<div className="space-y-6 max-w-6xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">Loading...</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{[0, 1, 2].map((index) => (
					<Card key={index} className="h-full">
						<CardHeader className="py-2 border-b">
							<Skeleton className="h-6 w-6 rounded" />
						</CardHeader>
						<CardContent className="pt-2 space-y-2">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-3/4" />
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

function ConfigRow({ label, tooltip, children }: { label: string; tooltip: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between py-2">
			<div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
				<span>{label}</span>
				<Tooltip>
					<TooltipTrigger asChild>
						<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
					</TooltipTrigger>
					<TooltipContent className="max-w-xs text-xs font-normal">{tooltip}</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex items-center gap-2">{children}</div>
		</div>
	);
}
