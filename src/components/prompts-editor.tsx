"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Save, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
	createdAt: Date;
}

interface EditablePrompt {
	id?: string; // undefined for new prompts
	value: string;
	groupCategory: string;
	groupPrefix: string;
	enabled: boolean;
}

interface PromptsEditorProps {
	initialPrompts: Prompt[];
	brandId: string;
	pageTitle: string;
	pageDescription: string;
}

export function PromptsEditor({ initialPrompts, brandId, pageTitle, pageDescription }: PromptsEditorProps) {
	// Maximum limits
	const MAX_PROMPTS = 150;

	const [prompts, setPrompts] = useState<EditablePrompt[]>(
		initialPrompts.map((p) => ({
			id: p.id,
			value: p.value,
			groupCategory: p.groupCategory || "",
			groupPrefix: p.groupPrefix || "",
			enabled: p.enabled,
		})),
	);
	const [isLoading, setIsLoading] = useState(false);
	const saveInProgress = useRef(false);
	const router = useRouter();

	const addPrompt = () => {
		// Count only enabled prompts for the limit
		const enabledCount = prompts.filter((p) => p.enabled).length;
		if (enabledCount < MAX_PROMPTS) {
			setPrompts([...prompts, { value: "", groupCategory: "", groupPrefix: "", enabled: true }]);
		}
	};

	const updatePrompt = (index: number, field: keyof EditablePrompt, value: string | boolean) => {
		const updated = [...prompts];
		updated[index] = { ...updated[index], [field]: value };
		setPrompts(updated);
	};

	const savePrompts = async () => {
		// Prevent duplicate saves
		if (saveInProgress.current) {
			console.warn("Save already in progress, ignoring duplicate request");
			return;
		}

		saveInProgress.current = true;
		setIsLoading(true);
		try {
			// Get valid prompts (non-empty value)
			const validPrompts = prompts.filter((p) => p.value.trim());

			// Check server-side limits before saving (only count enabled prompts)
			const enabledValidPrompts = validPrompts.filter((p) => p.enabled);
			if (enabledValidPrompts.length > MAX_PROMPTS) {
				alert(`You can only have a maximum of ${MAX_PROMPTS} enabled prompts.`);
				setIsLoading(false);
				return;
			}

			// Separate existing prompts vs new prompts
			const existingPrompts = validPrompts.filter((p) => p.id);
			const newPrompts = validPrompts.filter((p) => !p.id);

			// Find prompts that were removed (exist in initialPrompts but not in current validPrompts)
			const currentIds = new Set(existingPrompts.map((p) => p.id));
			const removedPrompts = initialPrompts.filter((p) => !currentIds.has(p.id));

			const allPromises = [];

			// Update existing prompts
			for (const prompt of existingPrompts) {
				allPromises.push(
					fetch(`/api/brands/${brandId}/prompts/${prompt.id}`, {
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							value: prompt.value.trim(),
							groupCategory: prompt.groupCategory.trim() || null,
							groupPrefix: prompt.groupPrefix.trim() || null,
							enabled: prompt.enabled,
						}),
					}).then((response) => {
						if (!response.ok) {
							throw new Error(`Failed to update prompt "${prompt.value}": ${response.statusText}`);
						}
						return response;
					}),
				);
			}

			// Create new prompts
			for (const prompt of newPrompts) {
				allPromises.push(
					fetch(`/api/brands/${brandId}/prompts`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							value: prompt.value.trim(),
							groupCategory: prompt.groupCategory.trim() || null,
							groupPrefix: prompt.groupPrefix.trim() || null,
							enabled: prompt.enabled,
						}),
					}).then((response) => {
						if (!response.ok) {
							throw new Error(`Failed to create prompt "${prompt.value}": ${response.statusText}`);
						}
						return response;
					}),
				);
			}

			// Disable removed prompts
			for (const prompt of removedPrompts) {
				allPromises.push(
					fetch(`/api/brands/${brandId}/prompts/${prompt.id}`, {
						method: "PUT",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							enabled: false,
						}),
					}).then((response) => {
						if (!response.ok) {
							throw new Error(`Failed to disable removed prompt ${prompt.id}: ${response.statusText}`);
						}
						return response;
					}),
				);
			}

			// Wait for all operations to complete
			await Promise.all(allPromises);

			router.push(`/app/${brandId}/prompts`);
		} catch (error) {
			console.error("Error saving prompts:", error);
			alert(`Failed to save prompts: ${error instanceof Error ? error.message : "Unknown error"}`);
		} finally {
			setIsLoading(false);
			saveInProgress.current = false;
		}
	};

	const validPromptCount = prompts.filter((p) => p.value.trim()).length;
	const enabledPromptCount = prompts.filter((p) => p.value.trim() && p.enabled).length;
	const isAtLimit = enabledPromptCount >= MAX_PROMPTS;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
					<p className="text-muted-foreground">{pageDescription}</p>
				</div>
			</div>

			<div className="space-y-4">
				{/* Header row - always shown */}
				<div className="grid grid-cols-11 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
					<div className="col-span-1 text-center">Enabled</div>
					<div className="col-span-4">Prompt Text</div>
					<div className="col-span-3">Group Category (Optional)</div>
					<div className="col-span-3">Group Prefix (Optional)</div>
				</div>

				{/* Content area - either placeholder or prompt rows */}
				{prompts.length === 0 ? (
					<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
						<div className="text-center py-8 text-muted-foreground">
							<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
							<p>No prompts yet.</p>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						{/* Prompt rows */}
						{prompts.map((prompt, index) => (
							<div
								key={index}
								className={`grid grid-cols-11 gap-2 items-center ${!prompt.enabled ? "opacity-60" : ""}`}
							>
								<div className="col-span-1 flex justify-center">
									<Checkbox
										checked={prompt.enabled}
										onCheckedChange={(checked) => updatePrompt(index, "enabled", checked === true)}
									/>
								</div>
								<Input
									value={prompt.value}
									onChange={(e) => updatePrompt(index, "value", e.target.value)}
									placeholder="Enter prompt text..."
									className="col-span-4"
								/>
								<Input
									value={prompt.groupCategory}
									onChange={(e) => updatePrompt(index, "groupCategory", e.target.value)}
									placeholder="e.g., personas"
									className="col-span-3"
								/>
								<Input
									value={prompt.groupPrefix}
									onChange={(e) => updatePrompt(index, "groupPrefix", e.target.value)}
									placeholder="e.g., best product for"
									className="col-span-3"
								/>
							</div>
						))}
					</div>
				)}

				{/* Buttons - always shown */}
				<div className="flex gap-2 items-center">
					<Button
						onClick={savePrompts}
						disabled={isLoading}
						size="sm"
						className="flex items-center gap-2 cursor-pointer"
					>
						{isLoading ? (
							<>Saving...</>
						) : (
							<>
								<Save className="h-4 w-4" />
								Save Prompts
							</>
						)}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={addPrompt}
						disabled={isAtLimit}
						className="flex items-center gap-2 cursor-pointer"
					>
						<Plus className="h-4 w-4" /> Add Prompt
					</Button>
					{isAtLimit && (
						<p className="text-xs text-muted-foreground">
							Maximum of {MAX_PROMPTS} enabled prompts allowed. Disable a prompt to add a new one.
						</p>
					)}
				</div>

				{/* Count information */}
				<div className="text-xs text-muted-foreground">
					<strong>
						{enabledPromptCount}/{MAX_PROMPTS}
					</strong>{" "}
					enabled prompts{enabledPromptCount >= MAX_PROMPTS ? " (maximum reached)" : ""}
					{validPromptCount !== enabledPromptCount && (
						<span className="ml-2">• {validPromptCount - enabledPromptCount} disabled</span>
					)}
				</div>
			</div>
		</div>
	);
}
