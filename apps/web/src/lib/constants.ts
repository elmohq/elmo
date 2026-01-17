// Constants for prompt processing
export const RUNS_PER_PROMPT = 5;

// Maximum limits for brand resources
export const MAX_COMPETITORS = 50;

// Model configurations
export const AI_MODELS = {
	OPENAI: {
		GROUP: "openai" as const,
		MODEL: "gpt-5-mini",
	},
	ANTHROPIC: {
		GROUP: "anthropic" as const,
		MODEL: "claude-sonnet-4-20250514",
	},
} as const;
