import { useI18n } from "@/lib/i18n";
import { getModelMeta } from "@workspace/config/models";
import { Button } from "@workspace/ui/components/button";
import { PlatformPicker } from "@/components/platform-picker";
import type { OnboardingPlatformState } from "@/server/platform-picks";

interface PlatformSelectionStepProps {
	state: NonNullable<OnboardingPlatformState>;
	selected: Set<string>;
	onSelectedChange: (next: Set<string>) => void;
	disabled: boolean;
	error?: string;
	onBack: () => void;
	onSubmit: () => void;
	submitLabel: string;
}

/**
 * The platform step every brand-creation flow shares: which platforms the new
 * brand is tracked on, within what the plan sells. Picking here rather than
 * accepting the plan defaults matters because the first cycle starts as soon as
 * the brand exists — a set corrected afterwards has already been paid for.
 */
export function PlatformSelectionStep({
	state,
	selected,
	onSelectedChange,
	disabled,
	error,
	onBack,
	onSubmit,
	submitLabel,
}: PlatformSelectionStepProps) {
	const { t, tn } = useI18n();
	const limit = state.platformPicks;
	const locked = state.available.length === 1;
	const onlyOption = state.available[0];

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				{locked && onlyOption
					? t("Your plan includes {platform} tracking. You can change platforms anytime in settings.", {
							platform: getModelMeta(onlyOption.model).label,
						})
					: tn(
							limit ?? 0,
							"Your plan tracks up to {count} platform for this brand. You can change these anytime in settings.",
							"Your plan tracks up to {count} platforms for this brand. You can change these anytime in settings.",
						)}
			</p>

			<PlatformPicker
				options={state.available}
				selected={selected}
				onSelectedChange={onSelectedChange}
				limit={limit}
				disabled={disabled || locked}
				className="sm:grid-cols-1 lg:grid-cols-1"
			/>

			{!locked && (
				<p className="text-xs text-muted-foreground">
					{selected.size === 0
						? t("Pick at least one platform.")
						: t("{selected} of {limit} selected", { selected: selected.size, limit: limit ?? 0 })}
				</p>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}

			<div className="flex gap-2">
				<Button type="button" variant="outline" onClick={onBack} disabled={disabled}>
					{t("Back")}
				</Button>
				<Button type="button" className="flex-1" onClick={onSubmit} disabled={disabled || selected.size === 0}>
					{submitLabel}
				</Button>
			</div>
		</div>
	);
}
