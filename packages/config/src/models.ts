/** In config so the marketing site can name platforms without the database-backed lib package. */
export interface ModelMeta {
	label: string;
	iconId: string;
}

export const KNOWN_MODELS: Record<string, ModelMeta> = {
	chatgpt: { label: "ChatGPT", iconId: "openai" },
	claude: { label: "Claude", iconId: "anthropic" },
	"google-ai-mode": { label: "Google AI Mode", iconId: "google" },
	"google-ai-overview": { label: "Google AI Overview", iconId: "google" },
	gemini: { label: "Gemini", iconId: "google" },
	copilot: { label: "Copilot", iconId: "microsoft" },
	perplexity: { label: "Perplexity", iconId: "perplexity" },
	grok: { label: "Grok", iconId: "x" },
	mistral: { label: "Mistral", iconId: "mistral" },
	deepseek: { label: "DeepSeek", iconId: "deepseek" },
	kimi: { label: "Kimi", iconId: "moonshotai" },
	qwen: { label: "Qwen", iconId: "qwen" },
};

/**
 * Surfaces that put paid placements next to an answer, and whose scraped payload
 * carries them. Ads are a property of the consumer product, so a model reached
 * through its API never has them however it is configured — which is also why
 * the Ads page counts only these models' runs in its denominator.
 */
export const AD_CAPABLE_MODELS = ["chatgpt", "google-ai-mode"] as const;

export type AdCapableModel = (typeof AD_CAPABLE_MODELS)[number];

export function isAdCapableModel(model: string): model is AdCapableModel {
	return (AD_CAPABLE_MODELS as readonly string[]).includes(model);
}

export function getModelMeta(model: string): ModelMeta {
	if (KNOWN_MODELS[model]) return KNOWN_MODELS[model];
	const label = model
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
	return { label, iconId: "generic" };
}
