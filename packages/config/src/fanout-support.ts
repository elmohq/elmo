import type { ModelConfig } from "./scrape-targets";

export type FanoutSupport =
	| { status: "supported" }
	| { status: "discontinued"; since: string }
	| { status: "never" }
	| { status: "unknown" };

const SUPPORTED = { status: "supported" } as const;
const NEVER = { status: "never" } as const;
const discontinued = (since: string) => ({ status: "discontinued", since }) as const;

// From the scheduled provider tests; apps/worker/scripts/fanout-support-report.ts
// checks this table against them. Keys are `model:provider`, `model:provider:pinned`
// for a target with a version slug, or `*:provider` for every model on a provider.
const FANOUT_SUPPORT: Record<string, FanoutSupport> = {
	"chatgpt:cloro": SUPPORTED,
	"chatgpt:dataforseo": SUPPORTED,
	"chatgpt:olostep": SUPPORTED,
	"chatgpt:openai-api": SUPPORTED,
	"chatgpt:searchapi": SUPPORTED,
	"chatgpt:brightdata": discontinued("2026-09-27"),
	"chatgpt:oxylabs": discontinued("2026-09-29"),

	"claude:anthropic-api": SUPPORTED,

	"copilot:cloro": SUPPORTED,
	"copilot:brightdata": NEVER,
	"copilot:olostep": NEVER,
	"copilot:searchapi": NEVER,

	"gemini:dataforseo:pinned": SUPPORTED,
	"gemini:dataforseo": NEVER,
	"gemini:brightdata": NEVER,
	"gemini:cloro": NEVER,
	"gemini:olostep": NEVER,
	"gemini:searchapi": NEVER,

	"google-ai-mode:brightdata": NEVER,
	"google-ai-mode:cloro": NEVER,
	"google-ai-mode:dataforseo": NEVER,
	"google-ai-mode:olostep": NEVER,
	"google-ai-mode:oxylabs": NEVER,
	"google-ai-mode:searchapi": NEVER,

	"google-ai-overview:brightdata": NEVER,
	"google-ai-overview:cloro": NEVER,
	"google-ai-overview:dataforseo": NEVER,
	"google-ai-overview:olostep": NEVER,
	"google-ai-overview:oxylabs": NEVER,
	"google-ai-overview:searchapi": NEVER,

	"perplexity:cloro": SUPPORTED,
	"perplexity:olostep": SUPPORTED,
	"perplexity:oxylabs": discontinued("2026-08-04"),
	"perplexity:dataforseo": NEVER,

	"mistral:mistral-api": SUPPORTED,

	"*:openrouter": NEVER,
	"*:stub": NEVER,
};

export function getFanoutSupport(target: ModelConfig): FanoutSupport {
	const { model, provider, version } = target;
	return (
		(version ? FANOUT_SUPPORT[`${model}:${provider}:pinned`] : undefined) ??
		FANOUT_SUPPORT[`${model}:${provider}`] ??
		FANOUT_SUPPORT[`*:${provider}`] ?? { status: "unknown" }
	);
}
