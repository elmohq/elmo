/**
 * Prompt-level model configuration (§8): per-prompt subtract/add of models.
 *
 * Standard models the brand tracks get an on/off toggle (writes
 * `run.model_enabled` for this prompt); assignable models (Claude, cloud) get an
 * Off/Base/Web mode select (writes `run.model_mode`) with a pool meter. The card
 * is absent in whitelabel (no prompt level) and in the read-only demo — the
 * server rejects these writes there regardless. EntitlementLimitError messages
 * from the server surface verbatim.
 */
import { useMemo, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ClientConfig } from "@workspace/config/types";
import type { ExclusionReason } from "@workspace/lib/config/resolve";
import { ASSIGNABLE_MODELS, UNLIMITED_COUNT } from "@workspace/config/plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Switch } from "@workspace/ui/components/switch";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { IconInfoCircle } from "@tabler/icons-react";
import { iconForModel, labelForModel } from "@/components/filter-bar";
import { brandKeys } from "@/hooks/use-brands";
import { getEffectiveConfigFn, setConfigValuesFn } from "@/server/config-entries";
import { EXCLUSION_REASON_COPY } from "@/lib/config-ui";

const CLAUDE = ASSIGNABLE_MODELS[0];

const PROMPT_WARNING_REASONS = new Set<ExclusionReason>([
	"catalog-disabled",
	"credentials-unready",
	"requires-entitlement",
	"pool-exhausted",
]);

type PromptConfig = Awaited<ReturnType<typeof getEffectiveConfigFn>>;
type ClaudeMode = "off" | "base" | "web";

export function PromptModelsCard({ brandId, promptId }: { brandId: string; promptId: string }) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;
	const readOnly = context.clientConfig?.features.readOnly ?? false;
	// Absent in whitelabel (no prompt level) and in the read-only demo.
	const canShow = mode !== "whitelabel" && !readOnly;

	const queryClient = useQueryClient();
	const queryKey = ["config", "prompt", promptId];
	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: () => getEffectiveConfigFn({ data: { scope: "prompt", id: promptId } }),
		enabled: canShow && !!promptId,
		staleTime: 30_000,
	});

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const write = async (entries: { key: string; selector?: { model?: string }; value?: unknown }[]) => {
		setBusy(true);
		setError(null);
		try {
			await setConfigValuesFn({ data: { scope: "prompt", id: promptId, entries } });
			await queryClient.invalidateQueries({ queryKey });
			// The brand's effective set can shift (per-prompt add/subtract).
			queryClient.invalidateQueries({ queryKey: brandKeys.all });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
		} finally {
			setBusy(false);
		}
	};

	const groups = useMemo(() => buildPromptGroups(data), [data]);

	if (!canShow) return null;
	if (isLoading && !data) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Models</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-2/3" />
				</CardContent>
			</Card>
		);
	}
	if (!data || (groups.standard.length === 0 && groups.assignable.length === 0)) return null;

	const pool = data.entitlements?.claudePromptPool ?? UNLIMITED_COUNT;
	const poolFinite = pool < UNLIMITED_COUNT;
	const poolUsage = data.assignablePoolUsage ?? 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Models for this prompt</CardTitle>
				<CardDescription>Override which models run for this prompt specifically.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="divide-y">
					{groups.standard.map((group) => (
						<StandardModelRow
							key={group.model}
							group={group}
							busy={busy}
							onToggle={(checked) =>
								write(
									checked
										? [{ key: "run.model_enabled", selector: { model: group.model } }]
										: [{ key: "run.model_enabled", selector: { model: group.model }, value: false }],
								)
							}
						/>
					))}
				</div>

				{groups.assignable.map((group) => {
					const assigned = group.claudeMode !== "off";
					const poolBlocked = poolFinite && !assigned && poolUsage >= pool;
					return (
						<AssignableModelRow
							key={group.model}
							group={group}
							busy={busy || poolBlocked}
							poolLabel={poolFinite ? `${poolUsage} of ${pool} Claude prompt${pool === 1 ? "" : "s"} used` : null}
							poolBlocked={poolBlocked}
							onModeChange={(next) => write(claudeModeEntries(next))}
						/>
					);
				})}

				{error && <p className="text-sm text-destructive">{error}</p>}
			</CardContent>
		</Card>
	);
}

interface PromptGroup {
	model: string;
	implementations: { provider: string; version?: string; webSearch: boolean }[];
	running: boolean;
	reasons: ExclusionReason[];
	isAssignable: boolean;
	promptDisabled: boolean;
	claudeMode: ClaudeMode;
}

function buildPromptGroups(data: PromptConfig | undefined): { standard: PromptGroup[]; assignable: PromptGroup[] } {
	if (!data) return { standard: [], assignable: [] };
	const targets = data.targets ?? [];
	const excluded = data.excluded ?? [];
	const rows = data.rows ?? [];
	const classesEnforced = data.entitlements?.standardModelMenu != null;

	const modeRow = rows.find((r) => r.key === "run.model_mode" && r.model === CLAUDE);
	const enabledRow = rows.find((r) => r.key === "run.model_enabled" && r.model === CLAUDE);
	let claudeMode: ClaudeMode = "off";
	if (modeRow) claudeMode = modeRow.value === "web" ? "web" : "base";
	else if (enabledRow?.value === true) claudeMode = "base";

	const groups = new Map<string, PromptGroup>();
	const ensure = (model: string): PromptGroup => {
		let group = groups.get(model);
		if (!group) {
			group = {
				model,
				implementations: [],
				running: false,
				reasons: [],
				isAssignable: classesEnforced && (ASSIGNABLE_MODELS as readonly string[]).includes(model),
				promptDisabled: false,
				claudeMode,
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
		for (const reason of item.reasons) {
			if (!group.reasons.includes(reason)) group.reasons.push(reason);
			if (reason === "prompt-disabled") group.promptDisabled = true;
		}
	}

	const all = [...groups.values()].sort((a, b) => a.model.localeCompare(b.model));
	// A standard model is brand-tracked (and therefore subtractable here) unless it
	// only appears because the brand doesn't pick it / it's off the plan menu.
	const standard = all.filter(
		(g) =>
			!g.isAssignable &&
			(g.running || (!g.reasons.includes("not-picked-by-brand") && !g.reasons.includes("not-in-plan-menu"))),
	);
	const assignable = all.filter((g) => g.isAssignable);
	return { standard, assignable };
}

/** The Off/Base/Web write for Claude: Off deletes the assignment rows (value omitted = delete). */
function claudeModeEntries(next: ClaudeMode): { key: string; selector: { model: string }; value?: unknown }[] {
	if (next === "off") {
		return [
			{ key: "run.model_mode", selector: { model: CLAUDE } },
			{ key: "run.model_enabled", selector: { model: CLAUDE } },
		];
	}
	return [{ key: "run.model_mode", selector: { model: CLAUDE }, value: next }];
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

function ModelLabel({ group }: { group: PromptGroup }) {
	return (
		<div className="flex items-center gap-2">
			{iconForModel(group.model, "h-4 w-4")}
			<span className="font-medium">{labelForModel(group.model)}</span>
		</div>
	);
}

function StandardModelRow({
	group,
	busy,
	onToggle,
}: {
	group: PromptGroup;
	busy: boolean;
	onToggle: (checked: boolean) => void;
}) {
	const warnings = group.reasons.filter((r) => PROMPT_WARNING_REASONS.has(r));
	return (
		<div className="flex items-center justify-between gap-4 py-3">
			<ModelLabel group={group} />
			<div className="flex items-center gap-2">
				{warnings.map((reason) => (
					<ReasonBadge key={reason} reason={reason} />
				))}
				<Switch checked={!group.promptDisabled} onCheckedChange={onToggle} disabled={busy} className="cursor-pointer" />
			</div>
		</div>
	);
}

function AssignableModelRow({
	group,
	busy,
	poolLabel,
	poolBlocked,
	onModeChange,
}: {
	group: PromptGroup;
	busy: boolean;
	poolLabel: string | null;
	poolBlocked: boolean;
	onModeChange: (mode: ClaudeMode) => void;
}) {
	const warnings = group.reasons.filter((r) => PROMPT_WARNING_REASONS.has(r) && r !== "pool-exhausted");
	return (
		<div className="flex items-center justify-between gap-4 py-3 border-t">
			<div className="space-y-1">
				<ModelLabel group={group} />
				{poolLabel && (
					<p className="text-xs text-muted-foreground tabular-nums">
						{poolLabel}
						{poolBlocked && " — pool full"}
					</p>
				)}
			</div>
			<div className="flex items-center gap-2">
				{warnings.map((reason) => (
					<ReasonBadge key={reason} reason={reason} />
				))}
				<Select value={group.claudeMode} onValueChange={(value) => onModeChange(value as ClaudeMode)} disabled={busy}>
					<SelectTrigger className="w-28">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="off">Off</SelectItem>
						<SelectItem value="base">Base</SelectItem>
						<SelectItem value="web">Web</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
