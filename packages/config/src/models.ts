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
	copilot: { label: "Microsoft Copilot", iconId: "microsoft" },
	"bing-ai-mode": { label: "Bing AI Mode", iconId: "microsoft" },
	perplexity: { label: "Perplexity", iconId: "perplexity" },
	grok: { label: "Grok", iconId: "x" },
	mistral: { label: "Mistral", iconId: "mistral" },
	deepseek: { label: "DeepSeek", iconId: "deepseek" },
	kimi: { label: "Kimi", iconId: "moonshotai" },
	qwen: { label: "Qwen", iconId: "qwen" },
	meta: { label: "Meta", iconId: "meta" },
};

export function getModelMeta(model: string): ModelMeta {
	if (KNOWN_MODELS[model]) return KNOWN_MODELS[model];
	const label = model
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
	return { label, iconId: "generic" };
}
