export type FanoutSupport = "supported" | "unsupported" | "unknown";

const GOOGLE_SURFACES = ["gemini", "google-ai-mode", "google-ai-overview"];

const SUPPORT: Record<string, { supported?: string[]; unsupported?: string[]; all?: FanoutSupport }> = {
	brightdata: { supported: ["chatgpt", "perplexity"], unsupported: [...GOOGLE_SURFACES, "copilot"] },
	cloro: { supported: ["chatgpt", "perplexity", "copilot"], unsupported: GOOGLE_SURFACES },
	oxylabs: { supported: ["chatgpt", "perplexity"], unsupported: GOOGLE_SURFACES },
	searchapi: { supported: ["chatgpt", "perplexity", "copilot"], unsupported: GOOGLE_SURFACES },
	olostep: { supported: ["chatgpt", "perplexity"], unsupported: GOOGLE_SURFACES },
	dataforseo: { supported: ["chatgpt", "perplexity"], unsupported: GOOGLE_SURFACES },
	openrouter: { all: "unsupported" },
	"openai-api": { all: "supported" },
	"anthropic-api": { all: "supported" },
	"mistral-api": { all: "supported" },
	stub: { all: "unsupported" },
};

export function getFanoutSupport(provider: string, model: string): FanoutSupport {
	const entry = SUPPORT[provider];
	if (!entry) return "unknown";
	if (entry.all) return entry.all;
	if (entry.supported?.includes(model)) return "supported";
	if (entry.unsupported?.includes(model)) return "unsupported";
	return "unknown";
}
