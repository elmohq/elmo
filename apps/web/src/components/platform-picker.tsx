import { getModelMeta } from "@workspace/config/models";
import type { ProviderAccess } from "@workspace/lib/providers";
import { projectMonthlyTargetCostUsd } from "@workspace/lib/usage";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useId } from "react";

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
 * Self-hosted only: what this brand's tracking costs to run, so the page can
 * total it. A per-row monthly figure was the wrong grain — the decision is what
 * the whole selection costs, not what one platform contributes to it.
 */
export type CostBasis = { enabledPrompts: number; runsPerDay: number; replication: number };

/** Cents below a dollar, whole dollars above — the precision each range needs. */
export function formatUsd(amount: number): string {
	if (amount === 0) return "$0";
	if (amount < 0.01) return `$${amount.toFixed(4)}`;
	if (amount < 1) return `$${amount.toFixed(3)}`;
	if (amount < 100) return `$${amount.toFixed(2)}`;
	return `$${Math.round(amount).toLocaleString()}`;
}

/**
 * The operator's line under a platform: the unit price and who serves it. The
 * monthly figure belongs to the page, which can total the whole selection —
 * per row it invited adding up twelve numbers to answer one question.
 */
export function PlatformOperatorDetail({ option }: { option: PlatformOption }) {
	if (option.providerName == null && option.costPerRunUsd == null) return null;

	const parts = [
		option.costPerRunUsd != null ? `≈${formatUsd(option.costPerRunUsd)}/run` : null,
		option.providerName ?? null,
	].filter(Boolean);

	return <span className="block font-mono text-[10px] text-muted-foreground tabular-nums">{parts.join(" · ")}</span>;
}

/**
 * What a selection costs to run for a month, at this brand's prompt count and
 * cadence. Platforms with no price estimate contribute nothing, so a figure is a
 * floor rather than a guess.
 */
export function projectSelectionCostUsd(
	options: PlatformOption[],
	selected: ReadonlySet<string>,
	costBasis: CostBasis,
): number {
	return options
		.filter((option) => selected.has(option.model))
		.reduce(
			(total, option) =>
				total + (projectMonthlyTargetCostUsd({ costPerRunUsd: option.costPerRunUsd ?? null, ...costBasis }) ?? 0),
			0,
		);
}

interface PlatformPickerProps {
	options: PlatformOption[];
	selected: Set<string>;
	/** Receives the whole next selection; the picker owns what a toggle means. */
	onSelectedChange: (next: Set<string>) => void;
	/** Unchecked options disable once this many are selected; null = no limit. */
	limit: number | null;
	disabled?: boolean;
	className?: string;
}

export function PlatformPicker({
	options,
	selected,
	onSelectedChange,
	limit,
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
		<PlatformGrid className={className}>
			{options.map((option) => {
				const checked = selected.has(option.model);
				const atLimit = !checked && limit !== null && selected.size >= limit;
				const checkboxId = `${idPrefix}-${option.model}`;
				return (
					<label
						key={option.model}
						htmlFor={checkboxId}
						className={cn(PLATFORM_ROW, atLimit ? "opacity-50" : "cursor-pointer hover:bg-accent/50")}
					>
						<Checkbox
							id={checkboxId}
							checked={checked}
							disabled={atLimit || disabled}
							onCheckedChange={(value) => toggle(option.model, value === true)}
						/>
						<PlatformRowBody option={option} />
					</label>
				);
			})}
		</PlatformGrid>
	);
}

export function PlatformList({ options, className }: { options: PlatformOption[]; className?: string }) {
	return (
		<PlatformGrid className={className}>
			{options.map((option) => (
				<div key={option.model} className={PLATFORM_ROW}>
					<PlatformRowBody option={option} />
				</div>
			))}
		</PlatformGrid>
	);
}

const PLATFORM_ROW = "flex items-center gap-3 rounded-md border p-3";

function PlatformGrid({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}

function PlatformRowBody({ option }: { option: PlatformOption }) {
	return (
		<>
			<ModelIcon iconId={getModelMeta(option.model).iconId} className="size-5 shrink-0" />
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{getModelMeta(option.model).label}</span>
				<PlatformOperatorDetail option={option} />
			</span>
		</>
	);
}
