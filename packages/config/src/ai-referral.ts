const REFERRER_HOSTS: Record<string, string> = {
	"chatgpt.com": "ChatGPT",
	"chat.openai.com": "ChatGPT",
	"perplexity.ai": "Perplexity",
	"claude.ai": "Claude",
	"gemini.google.com": "Gemini",
	"bard.google.com": "Gemini",
	"copilot.microsoft.com": "Copilot",
	"copilot.cloud.microsoft": "Copilot",
	"chat.deepseek.com": "DeepSeek",
	"grok.com": "Grok",
	"meta.ai": "Meta AI",
	"you.com": "You.com",
	"phind.com": "Phind",
	"doubao.com": "Doubao",
	"kimi.com": "Kimi",
	"kimi.moonshot.cn": "Kimi",
	"chat.mistral.ai": "Le Chat",
};

const UTM_SOURCES: Record<string, string> = {
	...REFERRER_HOSTS,
	chatgpt: "ChatGPT",
	openai: "ChatGPT",
	perplexity: "Perplexity",
	claude: "Claude",
	gemini: "Gemini",
	"copilot.com": "Copilot",
	copilot: "Copilot",
	deepseek: "DeepSeek",
	grok: "Grok",
	"x.ai": "Grok",
	phind: "Phind",
	kimi: "Kimi",
};

function normalize(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^www\./, "");
}

function hostOf(referrer: string): string | null {
	try {
		return normalize(new URL(referrer).hostname);
	} catch {
		return null;
	}
}

export function detectAiAssistant({ referrer, search }: { referrer: string; search: string }): string | null {
	const host = hostOf(referrer);
	if (host) {
		for (const [known, assistant] of Object.entries(REFERRER_HOSTS)) {
			if (host === known || host.endsWith(`.${known}`)) return assistant;
		}
	}

	const utmSource = new URLSearchParams(search).get("utm_source");
	if (!utmSource) return null;
	return UTM_SOURCES[normalize(utmSource)] ?? null;
}
