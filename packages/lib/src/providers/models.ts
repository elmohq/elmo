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
};

export function getModelMeta(model: string): ModelMeta {
	if (KNOWN_MODELS[model]) return KNOWN_MODELS[model];
	const label = model
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
	return { label, iconId: "generic" };
}

export const MODEL_TO_LEGACY_MODEL_GROUP: Record<string, string> = {
	chatgpt: "openai",
	claude: "anthropic",
	"google-ai-mode": "google",
};

export const LEGACY_MODEL_GROUP_TO_MODEL: Record<string, string> = {
	openai: "chatgpt",
	anthropic: "claude",
	google: "google-ai-mode",
};
