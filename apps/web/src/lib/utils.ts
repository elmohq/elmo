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
		case "chatgpt":
			return "ChatGPT";
		case "claude":
			return "Claude";
		case "google-ai-mode":
			return "Google AI Mode";
		case "google-ai-overview":
			return "Google AI Overview";
		case "gemini":
			return "Gemini";
		case "copilot":
			return "Copilot";
		case "perplexity":
			return "Perplexity";
		case "grok":
			return "Grok";
		// Legacy names for backward compatibility with stored data
		case "openai":
			return "ChatGPT";
		case "anthropic":
			return "Claude";
		case "google":
			return "Google AI Mode";
		default:
			return model;
	}
}
