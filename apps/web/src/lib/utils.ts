/**
 * Shared utility functions.
 * Re-exports the cn() utility from @workspace/ui.
 */
export { cn } from "@workspace/ui/lib/utils";

/**
 * Get the display name for a model with proper capitalization
 */
export function getModelDisplayName(model: string): string {
	switch (model) {
		case "openai":
			return "OpenAI";
		case "anthropic":
			return "Anthropic";
		case "google":
			return "Google";
		default:
			return model;
	}
}
