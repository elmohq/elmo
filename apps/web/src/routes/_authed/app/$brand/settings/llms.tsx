/**
 * /app/$brand/settings/llms — the brand's model selection (§8).
 *
 * The first-ever write path for `run.enabled_models`: a checklist of standard
 * models (checked = tracked), each showing its target implementations and, when
 * applicable, exclusion-reason badges (B2). Saving all models reverts to the
 * legacy "track all" (null) state by deleting the row. Cloud adds a pick-count
 * meter and moves assignable models (Claude) to a per-prompt info block.
 *
 * Write access is gated by (readOnly === false) AND (mode !== whitelabel ||
 * user is instance admin); the server enforces it regardless. Read-only viewers
 * still see the current state.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientConfig } from "@workspace/config/types";
import type { ExclusionReason } from "@workspace/lib/config/resolve";
import { ASSIGNABLE_MODELS } from "@workspace/config/plans";
import { getAppName, getBrandName, buildTitle } from "@/lib/route-head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { IconInfoCircle } from "@tabler/icons-react";
import { iconForModel, labelForModel } from "@/components/filter-bar";
import { brandKeys } from "@/hooks/use-brands";
import { getEffectiveConfigFn, setConfigValuesFn } from "@/server/config-entries";
import { EXCLUSION_REASON_COPY, enabledModelsEntries, impactSummary, isTrackingAll } from "@/lib/config-ui";

export const Route = createFileRoute("/_authed/app/$brand/settings/llms")({
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("LLMs", { appName, brandName }) },
				{ name: "description", content: "Choose which AI models this brand is tracked against." },
			],
		};
	},
	component: LlmsSettingsPage,
});

/** Exclusion reasons that are meaningful warnings on the brand page. "Not tracked"
 *  (not-picked-by-brand) is just the unchecked state, and prompt-level reasons
 *  don't apply here — both are filtered out. */
const BRAND_WARNING_REASONS = new Set<ExclusionReason>([
	"catalog-disabled",
	"credentials-unready",
	"requires-entitlement",
	"not-in-plan-menu",
	"pool-exhausted",
]);

interface ModelGroup {
	model: string;
	implementations: { provider: string; version?: string; webSearch: boolean }[];
	running: boolean;
	reasons: ExclusionReason[];
	isAssignable: boolean;
}

function LlmsSettingsPage() {
	const { brand: brandId } = Route.useParams();
	const context = useRouteContext({ strict: false }) as {
		session?: { user?: { role?: string } } | null;
		clientConfig?: ClientConfig;
	};
	const mode = context.clientConfig?.mode;
	const readOnly = context.clientConfig?.features.readOnly ?? false;
	const isAdmin = context.session?.user?.role === "admin";
	const canEdit = !readOnly && (mode !== "whitelabel" || isAdmin);

	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["config", "brand", brandId],
		queryFn: () => getEffectiveConfigFn({ data: { scope: "brand", id: brandId } }),
		enabled: !!brandId,
		staleTime: 30_000,
	});

	const { standardGroups, assignableGroups, pickable, picks, standardModelPicks, cadenceHours } = useMemo(() => {
		const targets = data?.targets ?? [];
		const excluded = data?.excluded ?? [];
		const entitlements = data?.entitlements ?? null;
		const classesEnforced = entitlements?.standardModelMenu != null;
		const menu = entitlements?.standardModelMenu ?? null;

		const groups = new Map<string, ModelGroup>();
		const ensure = (model: string): ModelGroup => {
			let group = groups.get(model);
			if (!group) {
				group = {
					model,
					implementations: [],
					running: false,
					reasons: [],
					isAssignable: classesEnforced && (ASSIGNABLE_MODELS as readonly string[]).includes(model),
				};
				groups.set(model, group);
			}
			return group;
		};

		for (const target of targets) {
			const group = ensure(target.model);
			group.running = true;
			group.implementations.push({ provider: target.provider, version: target.version, webSearch: target.webSearch });
		}
		for (const item of excluded) {
			const group = ensure(item.target.model);
			group.implementations.push({
				provider: item.target.provider,
				version: item.target.version ?? undefined,
				webSearch: item.target.webSearch,
			});
			for (const reason of item.reasons) if (!group.reasons.includes(reason)) group.reasons.push(reason);
		}

		const all = [...groups.values()].sort((a, b) => a.model.localeCompare(b.model));
		const standard = all.filter((g) => !g.isAssignable);
		const assignable = all.filter((g) => g.isAssignable);
		const standardModels = standard.map((g) => g.model);
		const pickableModels = standardModels.filter((m) => menu === null || menu.includes(m));

		return {
			standardGroups: standard,
			assignableGroups: assignable,
			pickable: pickableModels,
			picks: (data?.values?.enabledModels?.value ?? null) as string[] | null,
			standardModelPicks: entitlements?.standardModelPicks ?? null,
			cadenceHours: Number(data?.values?.cadenceHours?.value ?? 24),
		};
	}, [data]);

	// Local checklist state, seeded from the resolved picks and re-seeded whenever
	// the server truth changes (initial load / after a save refetch).
	const [selected, setSelected] = useState<string[]>([]);
	const signature = useMemo(() => JSON.stringify({ picks, pickable }), [picks, pickable]);
	useEffect(() => {
		setSelected(picks === null ? pickable : pickable.filter((m) => picks.includes(m)));
	}, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [impact, setImpact] = useState<string | null>(null);

	const atPickLimit = standardModelPicks !== null && selected.length >= standardModelPicks;

	const toggle = (model: string, checked: boolean) => {
		setImpact(null);
		setSelected((prev) => (checked ? [...new Set([...prev, model])] : prev.filter((m) => m !== model)));
	};

	const save = async () => {
		if (!canEdit) return;
		setSaving(true);
		setError(null);
		setImpact(null);
		try {
			await setConfigValuesFn({
				data: { scope: "brand", id: brandId, entries: enabledModelsEntries(selected, pickable) },
			});
			const refetched = await queryClient.fetchQuery({
				queryKey: ["config", "brand", brandId],
				queryFn: () => getEffectiveConfigFn({ data: { scope: "brand", id: brandId } }),
			});
			// Filter bars, dashboards, and the brand switcher read effective models too.
			queryClient.invalidateQueries({ queryKey: brandKeys.all });
			setImpact(impactSummary({ modelCount: refetched.targets?.length ?? 0, cadenceHours }));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	};

	const trackingAll = isTrackingAll(selected, pickable);

	return (
		<div className="space-y-6 max-w-4xl">
			<div>
				<h1 className="text-3xl font-bold">LLMs</h1>
				<p className="text-muted-foreground">
					Choose which AI models this brand is evaluated against. Your prompts run against every model you track.
				</p>
			</div>

			{isLoading && !data ? (
				<div className="space-y-3">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-16 w-full" />
					))}
				</div>
			) : standardGroups.length === 0 && assignableGroups.length === 0 ? (
				<Card>
					<CardContent className="pt-6 text-sm text-muted-foreground">
						No models are configured for this deployment yet. The catalog is seeded on the worker&apos;s first boot, or
						an admin can add targets under Admin → Targets.
					</CardContent>
				</Card>
			) : (
				<>
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between gap-2">
								<CardTitle className="text-base">Tracked models</CardTitle>
								{standardModelPicks !== null && (
									<span className="text-sm text-muted-foreground tabular-nums">
										{selected.length} of {standardModelPicks} picks
									</span>
								)}
							</div>
							<CardDescription>
								{trackingAll
									? "Tracking all models (default)."
									: `Tracking ${selected.length} of ${pickable.length} available models.`}
							</CardDescription>
						</CardHeader>
						<CardContent className="divide-y">
							{standardGroups.map((group) => {
								const isPickable = pickable.includes(group.model);
								const checked = selected.includes(group.model);
								const disabled = !canEdit || !isPickable || (!checked && atPickLimit);
								return (
									<ModelRow
										key={group.model}
										group={group}
										checkable
										checked={checked}
										disabled={disabled}
										onToggle={(next) => toggle(group.model, next)}
									/>
								);
							})}
						</CardContent>
					</Card>

					{canEdit && (
						<div className="flex items-center gap-3">
							<Button onClick={save} disabled={saving} className="cursor-pointer">
								{saving ? "Saving…" : "Save"}
							</Button>
							{impact && <span className="text-sm text-green-600">{impact}</span>}
							{error && <span className="text-sm text-destructive">{error}</span>}
						</div>
					)}
					{!canEdit && (
						<p className="text-sm text-muted-foreground">
							{readOnly ? "This is a read-only demo." : "Only an administrator can change tracked models here."}
						</p>
					)}

					{assignableGroups.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Per-prompt models</CardTitle>
								<CardDescription>
									These models aren&apos;t tracked brand-wide. Enable them for individual prompts from the{" "}
									<Link to="/app/$brand/settings/prompts" params={{ brand: brandId }} className="underline">
										prompt settings
									</Link>
									.
								</CardDescription>
							</CardHeader>
							<CardContent className="divide-y">
								{assignableGroups.map((group) => (
									<ModelRow
										key={group.model}
										group={group}
										checkable={false}
										checked={false}
										disabled
										onToggle={() => {}}
									/>
								))}
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	);
}

function ModelRow({
	group,
	checkable,
	checked,
	disabled,
	onToggle,
}: {
	group: ModelGroup;
	checkable: boolean;
	checked: boolean;
	disabled: boolean;
	onToggle: (checked: boolean) => void;
}) {
	const warnings = group.reasons.filter((r) => BRAND_WARNING_REASONS.has(r));
	return (
		<div className="flex items-start justify-between gap-4 py-3">
			<label className={`flex items-start gap-3 ${checkable && !disabled ? "cursor-pointer" : ""}`}>
				{checkable && (
					<Checkbox
						checked={checked}
						disabled={disabled}
						onCheckedChange={(value) => onToggle(value === true)}
						className="mt-0.5"
					/>
				)}
				<div className="space-y-1.5">
					<div className="flex items-center gap-2">
						{iconForModel(group.model, "h-4 w-4")}
						<span className="font-medium">{labelForModel(group.model)}</span>
						<span className="font-mono text-xs text-muted-foreground">{group.model}</span>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{group.implementations.map((impl, i) => (
							<Badge
								key={`${impl.provider}-${impl.version ?? ""}-${i}`}
								variant="outline"
								className="font-mono text-[10px] font-normal"
							>
								{impl.provider}
								{impl.version ? ` · ${impl.version}` : ""}
								{impl.webSearch ? " · web" : ""}
							</Badge>
						))}
					</div>
				</div>
			</label>
			<div className="flex flex-wrap justify-end gap-1.5">
				{warnings.map((reason) => (
					<ReasonBadge key={reason} reason={reason} />
				))}
			</div>
		</div>
	);
}

function ReasonBadge({ reason }: { reason: ExclusionReason }) {
	const copy = EXCLUSION_REASON_COPY[reason];
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Badge
					variant="outline"
					className="font-normal border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 cursor-help gap-1"
				>
					<IconInfoCircle className="h-3 w-3" />
					{copy.label}
				</Badge>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-xs font-normal">{copy.description}</TooltipContent>
		</Tooltip>
	);
}
