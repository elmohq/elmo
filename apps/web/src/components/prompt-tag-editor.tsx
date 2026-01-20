"use client";

import { useState } from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Tag, Plus, X, Loader2 } from "lucide-react";
import { updatePromptTags } from "@/hooks/use-tags";
import { isSystemTag } from "@workspace/lib/tag-utils";
import { cn } from "@workspace/ui/lib/utils";

interface PromptTagEditorProps {
	brandId: string;
	promptId: string;
	// Current tags (includes computed system tag from API)
	currentTags: string[];
	// Callback when tags are updated
	onTagsUpdated?: (tags: string[]) => void;
	className?: string;
}

export function PromptTagEditor({
	brandId,
	promptId,
	currentTags,
	onTagsUpdated,
	className,
}: PromptTagEditorProps) {
	const [isAdding, setIsAdding] = useState(false);
	const [newTag, setNewTag] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	// Separate system tags from user tags
	const systemTags = currentTags.filter(isSystemTag);
	const userTags = currentTags.filter((tag) => !isSystemTag(tag));

	const handleAddTag = async () => {
		const tagName = newTag.trim().toLowerCase();
		if (!tagName || isSystemTag(tagName) || userTags.includes(tagName)) {
			setNewTag("");
			setIsAdding(false);
			return;
		}

		setIsSaving(true);
		try {
			const newUserTags = [...userTags, tagName];
			await updatePromptTags(brandId, promptId, newUserTags);
			onTagsUpdated?.([...systemTags, ...newUserTags]);
			setNewTag("");
			setIsAdding(false);
		} catch (error) {
			console.error("Failed to add tag:", error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleRemoveTag = async (tagToRemove: string) => {
		if (isSystemTag(tagToRemove)) return;

		setIsSaving(true);
		try {
			const newUserTags = userTags.filter((t) => t !== tagToRemove);
			await updatePromptTags(brandId, promptId, newUserTags);
			onTagsUpdated?.([...systemTags, ...newUserTags]);
		} catch (error) {
			console.error("Failed to remove tag:", error);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className={cn("flex flex-wrap items-center gap-1.5", className)}>
			{/* System tags (read-only) */}
			{systemTags.map((tag) => (
				<Badge key={tag} variant="secondary" className="text-xs capitalize">
					{tag}
				</Badge>
			))}

			{/* User tags (editable) */}
			{userTags.map((tag) => (
				<Badge key={tag} variant="outline" className="text-xs pr-1 gap-1">
					{tag}
					<button
						onClick={() => handleRemoveTag(tag)}
						className="ml-0.5 hover:bg-muted rounded-sm p-0.5 cursor-pointer"
						disabled={isSaving}
					>
						<X className="h-3 w-3" />
					</button>
				</Badge>
			))}

			{/* Add tag */}
			{isAdding ? (
				<div className="flex items-center gap-1">
					<Input
						value={newTag}
						onChange={(e) => setNewTag(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleAddTag();
							} else if (e.key === "Escape") {
								setNewTag("");
								setIsAdding(false);
							}
						}}
						placeholder="tag name"
						className="h-6 w-24 text-xs px-2"
						autoFocus
						disabled={isSaving}
					/>
					<Button
						size="sm"
						variant="ghost"
						onClick={handleAddTag}
						disabled={!newTag.trim() || isSaving}
						className="h-6 w-6 p-0 cursor-pointer"
					>
						{isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							setNewTag("");
							setIsAdding(false);
						}}
						className="h-6 w-6 p-0 cursor-pointer"
					>
						<X className="h-3 w-3" />
					</Button>
				</div>
			) : (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setIsAdding(true)}
					className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
				>
					<Plus className="h-3 w-3 mr-1" />
					Tag
				</Button>
			)}

			{isSaving && !isAdding && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
		</div>
	);
}
