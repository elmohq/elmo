import { getModelMeta } from "@workspace/config/models";
import type { ProviderAccess } from "@workspace/lib/providers";
import { projectMonthlyTargetCostUsd } from "@workspace/lib/usage";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { cn } from "@workspace/ui/lib/utils";
import { useId } from "react";

export type PlatformOption = {
	model: string;
	webSearch: boolean;
	access: ProviderAccess;
	/**
	 * Which vendor serves the target, and what it costs to run. Present only for
	 * the operator — a cloud or whitelabel customer is buying tracked platforms,
	 * not our choice of scraper or our margin on it.
	 */
	providerName?: string;
	version?: string;
	costPerRunUsd?: number | null;
};

/**
 * Self-hosted only: what this brand's tracking costs to run, so a row can show
 * the monthly figure that actually decides whether to switch a platform on.
 */
export type CostBasis = { enabledPrompts: number; runsPerDay: number; replication: number };

/** Cents below a dollar, whole dollars above — the precision each range needs. */
function formatUsd(amount: number): string {
	if (amount === 0) return "$0";
	if (amount < 0.01) return `$${amount.toFixed(4)}`;
	if (amount < 1) return `$${amount.toFixed(3)}`;
	if (amount < 100) return `$${amount.toFixed(2)}`;
	return `$${Math.round(amount).toLocaleString()}`;
}

/**
 * The operator's line under a platform: what it costs them to run and who
 * serves it. Renders nothing for a customer, who is sent neither.
 */
export function PlatformOperatorDetail({
	option,
	costBasis = null,
}: {
	option: PlatformOption;
	costBasis?: CostBasis | null;
}) {
	if (option.providerName == null && option.costPerRunUsd == null) return null;

	const monthlyUsd = costBasis
		? projectMonthlyTargetCostUsd({ costPerRunUsd: option.costPerRunUsd ?? null, ...costBasis })
		: null;

	const parts = [
		option.costPerRunUsd != null ? `≈${formatUsd(option.costPerRunUsd)}/run` : null,
		monthlyUsd !== null ? `${formatUsd(monthlyUsd)}/mo here` : null,
		option.providerName ?? null,
	].filter(Boolean);

	return <span className="block font-mono text-[10px] text-muted-foreground tabular-nums">{parts.join(" · ")}</span>;
}

interface PlatformPickerProps {
	options: PlatformOption[];
	selected: Set<string>;
	/** Receives the whole next selection; the picker owns what a toggle means. */
	onSelectedChange: (next: Set<string>) => void;
	/** Unchecked options disable once this many are selected; null = no limit. */
	limit: number | null;
	/** Omit outside self-hosted, where the viewer doesn't pay the providers. */
	costBasis?: CostBasis | null;
	disabled?: boolean;
	className?: string;
}

export function PlatformPicker({
	options,
	selected,
	onSelectedChange,
	limit,
	costBasis = null,
	disabled = false,
	className,
}: PlatformPickerProps) {
	const idPrefix = useId();

	const toggle = (model: string, checked: boolean) => {
		const next = new Set(selected);
		if (checked) next.add(model);
		else next.delete(model);
		onSelectedChange(next);
	};

	return (
		<div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-3", className)}>
			{options.map((option) => {
				const checked = selected.has(option.model);
				const atLimit = !checked && limit !== null && selected.size >= limit;
				const checkboxId = `${idPrefix}-${option.model}`;
				return (
					<label
						key={option.model}
						htmlFor={checkboxId}
						className={`flex items-center gap-3 rounded-md border p-3 ${
							atLimit ? "opacity-50" : "cursor-pointer hover:bg-accent/50"
						}`}
					>
						<Checkbox
							id={checkboxId}
							checked={checked}
							disabled={atLimit || disabled}
							onCheckedChange={(value) => toggle(option.model, value === true)}
						/>
						<ModelIcon iconId={getModelMeta(option.model).iconId} className="size-5 shrink-0" />
						{/* The operator detail sits under the name rather than beside it, so a
						    long provider string can't squeeze the platform it describes. */}
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm font-medium">{getModelMeta(option.model).label}</span>
							<PlatformOperatorDetail option={option} costBasis={costBasis} />
						</span>
					</label>
				);
			})}
		</div>
	);
}
