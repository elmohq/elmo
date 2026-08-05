import type { ClaudeTrackingMode, TrackingTargetPolicy } from "@workspace/config/plans";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { iconForModel, labelForModel } from "@/components/filter-bar";
import type {
	CloudOnboardingPrompt,
	CloudOnboardingTrackingData,
	CloudOnboardingTrackingState,
} from "@/lib/cloud-onboarding";
import { getLiveClaudeAssignments } from "@/lib/cloud-onboarding";
import { formatCadenceMinutes } from "@/lib/cloud-tracking-settings";

const CLAUDE_MODE_LABELS: Record<ClaudeTrackingMode, string> = {
	"base-model": "Base model",
	"native-web-search": "Native web search",
};

type SharedProps = {
	data: CloudOnboardingTrackingData;
	state: CloudOnboardingTrackingState;
	onChange: (state: CloudOnboardingTrackingState) => void;
	disabled?: boolean;
};

export function CloudOnboardingTargetPicker({ data, state, onChange, disabled = false }: SharedProps) {
	if (data.resolved.access !== "allowed") return null;
	const definition = data.resolved.entitlements.trackingTargets;
	const selectedCount = state.targetSelections.size;

	function toggleTarget(target: TrackingTargetPolicy, checked: boolean) {
		const targetSelections = new Map(state.targetSelections);
		if (checked) targetSelections.set(target.targetKey, null);
		else targetSelections.delete(target.targetKey);
		onChange({ ...state, targetSelections });
	}

	function updateCadence(targetKey: string, value: string) {
		const parsed = Number(value);
		const targetSelections = new Map(state.targetSelections);
		targetSelections.set(targetKey, Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null);
		onChange({ ...state, targetSelections });
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold">Answer engines</h2>
					<p className="text-muted-foreground">
						Choose {definition.minimumSelected}
						{definition.minimumSelected !== definition.maximumSelected ? `–${definition.maximumSelected}` : ""} answer
						engine{definition.maximumSelected === 1 ? "" : "s"} for every enabled prompt.
					</p>
				</div>
				<Badge variant="secondary">{selectedCount} selected</Badge>
			</div>
			<div className="divide-y rounded-md border">
				{definition.targets.map((target) => {
					const selected = state.targetSelections.has(target.targetKey);
					const atCapacity = selectedCount >= definition.maximumSelected;
					const cadencePolicy = target.schedule.cadencePolicy;
					const requestedCadence = state.targetSelections.get(target.targetKey);
					const targetInputId = `onboarding-target-${target.targetKey}`;
					const cadenceInputId = `onboarding-cadence-${target.targetKey}`;
					return (
						<div key={target.targetKey} className="flex flex-wrap items-center justify-between gap-4 p-4">
							<div className="flex min-w-0 items-center gap-3">
								<Checkbox
									id={targetInputId}
									checked={selected}
									disabled={disabled || definition.mode === "fixed" || (!selected && atCapacity)}
									onCheckedChange={(checked) => toggleTarget(target, checked === true)}
								/>
								{iconForModel(target.targetKey, "size-5 shrink-0")}
								<Label htmlFor={targetInputId} className="font-medium">
									{labelForModel(target.targetKey)}
								</Label>
							</div>
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								{cadencePolicy.mode === "fixed" ? (
									<span>{formatCadenceMinutes(target.schedule.cadenceMinutes)}</span>
								) : (
									<>
										<Label htmlFor={cadenceInputId} className="text-xs">
											Minutes
										</Label>
										<Input
											id={cadenceInputId}
											type="number"
											className="w-28"
											min={cadencePolicy.minimumCadenceMinutes}
											max={cadencePolicy.maximumCadenceMinutes}
											value={requestedCadence ?? target.schedule.cadenceMinutes}
											disabled={disabled || !selected}
											onChange={(event) => updateCadence(target.targetKey, event.target.value)}
										/>
									</>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function CloudOnboardingClaudePicker({
	data,
	prompts,
	state,
	onChange,
	disabled = false,
}: SharedProps & { prompts: CloudOnboardingPrompt[] }) {
	if (data.resolved.access !== "allowed") return null;
	const claude = data.resolved.entitlements.claudeTracking;
	if (!claude.enabled || claude.allowedModes.length === 0) return null;

	const availablePrompts = prompts.filter((prompt) => prompt.enabled && prompt.value.trim());
	const liveAssignments = getLiveClaudeAssignments(prompts, state.claudeAssignments);
	const usedOutsideBrand = Math.max(0, data.claudeUsage.usedPromptSlots - data.claudeAssignments.length);
	const projectedUsage = usedOutsideBrand + liveAssignments.length;
	const availableForBrand = Math.max(0, data.claudeUsage.totalPromptSlots - usedOutsideBrand);
	const defaultMode = claude.allowedModes[0];

	function togglePrompt(promptClientId: string, checked: boolean) {
		const claudeAssignments = new Map(state.claudeAssignments);
		if (checked) claudeAssignments.set(promptClientId, defaultMode);
		else claudeAssignments.delete(promptClientId);
		onChange({ ...state, claudeAssignments });
	}

	function updateMode(promptClientId: string, mode: ClaudeTrackingMode) {
		onChange({
			...state,
			claudeAssignments: new Map(state.claudeAssignments).set(promptClientId, mode),
		});
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold">Claude prompt tracking</h2>
					<p className="text-muted-foreground">
						Choose which prompts also run on Claude, using either the base model or native web search.
					</p>
				</div>
				<Badge variant="secondary">
					{liveAssignments.length} / {availableForBrand} selected
				</Badge>
			</div>
			{availablePrompts.length === 0 ? (
				<p className="text-sm text-muted-foreground">Enable a prompt before assigning Claude tracking.</p>
			) : (
				<div className="max-h-96 divide-y overflow-y-auto rounded-md border">
					{availablePrompts.map((prompt) => {
						const selectedMode = state.claudeAssignments.get(prompt._key);
						const selected = selectedMode !== undefined;
						const atCapacity = projectedUsage >= data.claudeUsage.totalPromptSlots;
						const inputId = `onboarding-claude-${prompt._key}`;
						return (
							<div key={prompt._key} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
								<div className="flex min-w-0 flex-1 items-start gap-3">
									<Checkbox
										id={inputId}
										checked={selected}
										disabled={disabled || (!selected && atCapacity)}
										onCheckedChange={(checked) => togglePrompt(prompt._key, checked === true)}
									/>
									<Label htmlFor={inputId} className="cursor-pointer font-normal leading-5">
										{prompt.value}
									</Label>
								</div>
								{selectedMode && (
									<Select
										value={selectedMode}
										disabled={disabled}
										onValueChange={(mode) => updateMode(prompt._key, mode as ClaudeTrackingMode)}
									>
										<SelectTrigger size="sm" aria-label={`Claude mode for ${prompt.value}`}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{claude.allowedModes.map((mode) => (
												<SelectItem key={mode} value={mode}>
													{CLAUDE_MODE_LABELS[mode]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							</div>
						);
					})}
				</div>
			)}
			<p className="text-xs text-muted-foreground">
				{usedOutsideBrand} organization slot{usedOutsideBrand === 1 ? " is" : "s are"} already in use. Your plan
				provides {data.claudeUsage.totalPromptSlots} total Claude prompt slots.
			</p>
		</div>
	);
}
