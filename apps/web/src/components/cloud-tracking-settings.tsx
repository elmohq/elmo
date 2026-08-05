import { useRouter } from "@tanstack/react-router";
import type { ClaudeTrackingMode, TrackingTargetPolicy } from "@workspace/config/plans";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useMemo, useState } from "react";
import { iconForModel, labelForModel } from "@/components/filter-bar";
import { buildInitialTargetSelections, formatCadenceMinutes } from "@/lib/cloud-tracking-settings";
import {
	type CloudTrackingSettingsData,
	updateBrandTargetsFn,
	updateClaudePromptAssignmentsFn,
} from "@/server/tracking-settings";

type SelectionState = Map<string, number | null>;
type ClaudeAssignmentState = Map<string, ClaudeTrackingMode>;

const CLAUDE_MODE_LABELS: Record<ClaudeTrackingMode, string> = {
	"base-model": "Base model",
	"native-web-search": "Native web search",
};

export function CloudTrackingSettings({ brandId, data }: { brandId: string; data: CloudTrackingSettingsData }) {
	const resolved = data.resolved;
	if (resolved.access === "denied") {
		return (
			<div className="space-y-6 max-w-4xl">
				<PageHeading />
				<Alert variant="destructive">
					<AlertTitle>Tracking is unavailable</AlertTitle>
					<AlertDescription>
						This workspace does not have an active tracking configuration ({resolved.reason.replaceAll("-", " ")}).
					</AlertDescription>
				</Alert>
			</div>
		);
	}
	return <AllowedCloudTrackingSettings brandId={brandId} data={data} resolved={resolved} />;
}

function AllowedCloudTrackingSettings({
	brandId,
	data,
	resolved,
}: {
	brandId: string;
	data: CloudTrackingSettingsData;
	resolved: Extract<CloudTrackingSettingsData["resolved"], { access: "allowed" }>;
}) {
	const router = useRouter();
	const targetDefinition = resolved.entitlements.trackingTargets;
	const initialSelections = useMemo<SelectionState>(
		() => buildInitialTargetSelections(targetDefinition, data.selections),
		[data.selections, targetDefinition],
	);
	const [selections, setSelections] = useState<SelectionState>(initialSelections);
	const [savingTargets, setSavingTargets] = useState(false);
	const [targetMessage, setTargetMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

	const claude = resolved.entitlements.claudeTracking;
	const claudeAvailable = claude.enabled && claude.allowedModes.length > 0;
	const defaultClaudeMode = claude.enabled ? claude.allowedModes[0] : undefined;
	const initialClaudeAssignments = useMemo<ClaudeAssignmentState>(
		() => new Map(data.claudeAssignments.map((assignment) => [assignment.promptId, assignment.mode])),
		[data.claudeAssignments],
	);
	const [claudeAssignments, setClaudeAssignments] = useState(initialClaudeAssignments);
	const [savingClaude, setSavingClaude] = useState(false);
	const [claudeMessage, setClaudeMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
	const usedOutsideBrand = Math.max(0, data.claudeUsage.usedPromptSlots - data.claudeAssignments.length);
	const projectedClaudeUsage = usedOutsideBrand + claudeAssignments.size;

	const selectedCount = selections.size;
	const selectionValid =
		selectedCount >= targetDefinition.minimumSelected && selectedCount <= targetDefinition.maximumSelected;
	const targetSettingsEditable =
		targetDefinition.mode === "configurable" ||
		targetDefinition.targets.some((target) => target.schedule.cadencePolicy.mode === "configurable");

	function toggleTarget(target: TrackingTargetPolicy, checked: boolean) {
		setSelections((current) => {
			const next = new Map(current);
			if (checked) next.set(target.targetKey, null);
			else next.delete(target.targetKey);
			return next;
		});
		setTargetMessage(null);
	}

	function updateCadence(targetKey: string, value: string) {
		const parsed = Number(value);
		setSelections((current) => {
			const next = new Map(current);
			next.set(targetKey, Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null);
			return next;
		});
		setTargetMessage(null);
	}

	async function saveTargets() {
		setTargetMessage(null);
		setSavingTargets(true);
		try {
			await updateBrandTargetsFn({
				data: {
					brandId,
					selections: [...selections].map(([targetKey, requestedCadenceMinutes]) => ({
						targetKey,
						requestedCadenceMinutes,
					})),
				},
			});
			setTargetMessage({ kind: "success", text: "Tracking settings saved." });
			await router.invalidate();
		} catch (error) {
			setTargetMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to save settings." });
		} finally {
			setSavingTargets(false);
		}
	}

	function toggleClaudePrompt(promptId: string, checked: boolean) {
		setClaudeAssignments((current) => {
			const next = new Map(current);
			if (checked && defaultClaudeMode) next.set(promptId, defaultClaudeMode);
			else next.delete(promptId);
			return next;
		});
		setClaudeMessage(null);
	}

	function updateClaudeMode(promptId: string, mode: ClaudeTrackingMode) {
		setClaudeAssignments((current) => new Map(current).set(promptId, mode));
		setClaudeMessage(null);
	}

	async function saveClaudePrompts() {
		setClaudeMessage(null);
		setSavingClaude(true);
		try {
			await updateClaudePromptAssignmentsFn({
				data: {
					brandId,
					assignments: [...claudeAssignments].map(([promptId, mode]) => ({ promptId, mode })),
				},
			});
			setClaudeMessage({ kind: "success", text: "Claude prompt tracking saved." });
			await router.invalidate();
		} catch (error) {
			setClaudeMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to save settings." });
		} finally {
			setSavingClaude(false);
		}
	}

	return (
		<div className="space-y-6 max-w-4xl">
			<PageHeading />

			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle>Answer engines</CardTitle>
							<CardDescription>
								Select {targetDefinition.minimumSelected}
								{targetDefinition.minimumSelected !== targetDefinition.maximumSelected
									? `–${targetDefinition.maximumSelected}`
									: ""}{" "}
								answer engine{targetDefinition.maximumSelected === 1 ? "" : "s"} for every enabled prompt.
							</CardDescription>
						</div>
						<Badge variant="secondary">{selectedCount} selected</Badge>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="divide-y rounded-md border">
						{targetDefinition.targets.map((target) => {
							const selected = selections.has(target.targetKey);
							const cadencePolicy = target.schedule.cadencePolicy;
							const requestedCadence = selections.get(target.targetKey);
							const targetInputId = `target-${target.targetKey}`;
							const cadenceInputId = `cadence-${target.targetKey}`;
							return (
								<div key={target.targetKey} className="flex flex-wrap items-center justify-between gap-4 p-4">
									<div className="flex min-w-0 items-center gap-3">
										<Checkbox
											id={targetInputId}
											checked={selected}
											disabled={targetDefinition.mode === "fixed" || savingTargets}
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
													disabled={!selected || savingTargets}
													onChange={(event) => updateCadence(target.targetKey, event.target.value)}
												/>
												<span className="hidden sm:inline">
													({cadencePolicy.minimumCadenceMinutes}–{cadencePolicy.maximumCadenceMinutes})
												</span>
											</>
										)}
									</div>
								</div>
							);
						})}
					</div>
					{!selectionValid && (
						<p className="text-sm text-destructive">
							{targetDefinition.minimumSelected === targetDefinition.maximumSelected
								? `Select exactly ${targetDefinition.minimumSelected} answer engines.`
								: `Select between ${targetDefinition.minimumSelected} and ${targetDefinition.maximumSelected} answer engines.`}
						</p>
					)}
					{targetMessage && <StatusMessage message={targetMessage} />}
					{targetSettingsEditable && (
						<Button type="button" onClick={saveTargets} disabled={!selectionValid || savingTargets}>
							{savingTargets ? "Saving…" : "Save answer engines"}
						</Button>
					)}
				</CardContent>
			</Card>

			{claudeAvailable && (
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle>Claude prompt tracking</CardTitle>
								<CardDescription>
									Choose a base-model or native web-search evaluation for each selected prompt.
								</CardDescription>
							</div>
							<Badge variant="secondary">
								{projectedClaudeUsage} / {data.claudeUsage.totalPromptSlots} organization slots
							</Badge>
						</div>
					</CardHeader>
					<CardContent className="space-y-4">
						{data.prompts.length === 0 ? (
							<p className="text-sm text-muted-foreground">Enable a prompt before assigning Claude tracking.</p>
						) : (
							<div className="max-h-96 divide-y overflow-y-auto rounded-md border">
								{data.prompts.map((prompt) => {
									const selectedMode = claudeAssignments.get(prompt.id);
									const selected = selectedMode !== undefined;
									const atCapacity = projectedClaudeUsage >= data.claudeUsage.totalPromptSlots;
									const inputId = `claude-prompt-${prompt.id}`;
									return (
										<div key={prompt.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
											<div className="flex min-w-0 flex-1 items-start gap-3">
												<Checkbox
													id={inputId}
													checked={selected}
													disabled={savingClaude || (!selected && atCapacity)}
													onCheckedChange={(checked) => toggleClaudePrompt(prompt.id, checked === true)}
												/>
												<Label htmlFor={inputId} className="cursor-pointer font-normal leading-5">
													{prompt.value}
												</Label>
											</div>
											{selectedMode && (
												<Select
													value={selectedMode}
													disabled={savingClaude}
													onValueChange={(mode) => updateClaudeMode(prompt.id, mode as ClaudeTrackingMode)}
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
							Your workspace includes {data.claudeUsage.includedPromptSlots} Claude prompt slots
							{data.claudeUsage.purchasedAddonPromptSlots > 0
								? ` plus ${data.claudeUsage.purchasedAddonPromptSlots} purchased add-on slots`
								: ""}
							. {usedOutsideBrand} slot{usedOutsideBrand === 1 ? " is" : "s are"} currently used by other brands in this
							workspace. Changes are enforced against the organization-wide limit when saved.
						</p>
						{claudeMessage && <StatusMessage message={claudeMessage} />}
						<Button
							type="button"
							onClick={saveClaudePrompts}
							disabled={savingClaude || projectedClaudeUsage > data.claudeUsage.totalPromptSlots}
						>
							{savingClaude ? "Saving…" : "Save Claude prompts"}
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

function PageHeading() {
	return (
		<div>
			<h1 className="text-3xl font-bold">LLMs</h1>
			<p className="text-muted-foreground">
				Configure which answer engines evaluate this brand and how often plan policy permits them to run.
			</p>
		</div>
	);
}

function StatusMessage({ message }: { message: { kind: "error" | "success"; text: string } }) {
	return (
		<p className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>{message.text}</p>
	);
}
