"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Save, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";

interface Prompt {
	id: string;
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	reputation: boolean;
	enabled: boolean;
	createdAt: Date;
}

interface EditablePrompt {
	value: string;
	groupCategory: string;
	groupPrefix: string;
}

interface PromptsEditorProps {
	initialPrompts: Prompt[];
	brandId: string;
	pageTitle: string;
	pageDescription: string;
	reputation: boolean;
}

export function PromptsEditor({ initialPrompts, brandId, pageTitle, pageDescription, reputation }: PromptsEditorProps) {
	// Maximum limits
	const MAX_REPUTATION_PROMPTS = 100;
	const MAX_NON_REPUTATION_PROMPTS = 50;
	const maxPrompts = reputation ? MAX_REPUTATION_PROMPTS : MAX_NON_REPUTATION_PROMPTS;

	const [prompts, setPrompts] = useState<EditablePrompt[]>(
		initialPrompts.map(p => ({
			value: p.value,
			groupCategory: p.groupCategory || "",
			groupPrefix: p.groupPrefix || ""
		}))
	);
	const [isLoading, setIsLoading] = useState(false);
	const router = useRouter();

	const addPrompt = () => {
		if (prompts.length < maxPrompts) {
			setPrompts([...prompts, { value: "", groupCategory: "", groupPrefix: "" }]);
		}
	};

	const removePrompt = (index: number) => {
		setPrompts(prompts.filter((_, i) => i !== index));
	};

	const updatePrompt = (index: number, field: keyof EditablePrompt, value: string) => {
		const updated = [...prompts];
		updated[index] = { ...updated[index], [field]: value };
		setPrompts(updated);
	};

	const savePrompts = async () => {
		setIsLoading(true);
		try {
			// Get valid prompts (non-empty value)
			const validPrompts = prompts.filter(p => p.value.trim());
			
			// Check server-side limits before saving
			if (validPrompts.length > maxPrompts) {
				alert(`You can only have a maximum of ${maxPrompts} ${reputation ? 'reputation' : 'non-reputation'} prompts.`);
				setIsLoading(false);
				return;
			}
			
			// Delete all existing prompts for this brand/reputation type
			for (const prompt of initialPrompts) {
				await fetch(`/api/brands/${brandId}/prompts/${prompt.id}`, {
					method: "DELETE",
				});
			}

			// Create new prompts
			for (const prompt of validPrompts) {
				await fetch(`/api/brands/${brandId}/prompts`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						value: prompt.value.trim(),
						reputation,
						groupCategory: prompt.groupCategory.trim() || null,
						groupPrefix: prompt.groupPrefix.trim() || null,
						enabled: true,
					}),
				});
			}

			router.push(`/app/${brandId}/${reputation ? 'reputation' : 'prompts'}`);
		} catch (error) {
			console.error("Error saving prompts:", error);
			alert("Failed to save prompts");
		} finally {
			setIsLoading(false);
		}
	};

	const validPromptCount = prompts.filter(p => p.value.trim()).length;
	const isAtLimit = prompts.length >= maxPrompts;

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
				<div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
					<div className="col-span-5">Prompt Text</div>
					<div className="col-span-3">Group Category (Optional)</div>
					<div className="col-span-3">Group Prefix (Optional)</div>
					<div className="col-span-1"></div>
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
							<div key={index} className="grid grid-cols-12 gap-2 items-center">
								<Input
									value={prompt.value}
									onChange={(e) => updatePrompt(index, "value", e.target.value)}
									placeholder="Enter prompt text..."
									className="col-span-5"
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
								<Button
									variant="outline"
									size="sm"
									onClick={() => removePrompt(index)}
									className="col-span-1 p-2 cursor-pointer"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				)}
				
				{/* Buttons - always shown */}
				<div className="flex gap-2 items-center">
					<Button onClick={savePrompts} disabled={isLoading} size="sm" className="flex items-center gap-2 cursor-pointer">
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
							Maximum of {maxPrompts} {reputation ? 'reputation' : 'non-reputation'} prompts allowed. Remove a prompt to add a new one.
						</p>
					)}
				</div>
				
				{/* Count information */}
				<div className="text-xs text-muted-foreground">
					<strong>{validPromptCount}/{maxPrompts}</strong> {reputation ? 'reputation' : 'non-reputation'} prompts{validPromptCount >= maxPrompts ? ' (maximum reached)' : ''}
				</div>
			</div>
		</div>
	);
} 