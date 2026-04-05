export interface EngineMeta {
	label: string;
	iconId: string;
}

export const KNOWN_ENGINES: Record<string, EngineMeta> = {
	chatgpt: { label: "ChatGPT", iconId: "openai" },
	claude: { label: "Claude", iconId: "anthropic" },
	"google-ai-mode": { label: "Google AI Mode", iconId: "google" },
	"google-ai-overview": { label: "Google AI Overview", iconId: "google" },
	gemini: { label: "Gemini", iconId: "google" },
	copilot: { label: "Copilot", iconId: "microsoft" },
	perplexity: { label: "Perplexity", iconId: "perplexity" },
	grok: { label: "Grok", iconId: "x" },
};

export function getEngineMeta(engine: string): EngineMeta {
	if (KNOWN_ENGINES[engine]) return KNOWN_ENGINES[engine];
	const label = engine
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
	return { label, iconId: "generic" };
}

export const ENGINE_TO_LEGACY_MODEL_GROUP: Record<string, string> = {
	chatgpt: "openai",
	claude: "anthropic",
	"google-ai-mode": "google",
};

export const LEGACY_MODEL_GROUP_TO_ENGINE: Record<string, string> = {
	openai: "chatgpt",
	anthropic: "claude",
	google: "google-ai-mode",
};
