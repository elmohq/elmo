"use client";

import { sanitizeUserTags } from "@workspace/lib/tag-utils";

/**
 * Update user tags for a prompt (system tags are computed automatically)
 */
export async function updatePromptTags(
	brandId: string,
	promptId: string,
	tags: string[],
): Promise<void> {
	// Filter out system tags and normalize
	const userTags = sanitizeUserTags(tags);

	const response = await fetch(`/api/brands/${brandId}/prompts/${promptId}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ tags: userTags }),
	});

	if (!response.ok) {
		const error = await response.json();
		throw new Error(error.error || "Failed to update prompt tags");
	}
}
