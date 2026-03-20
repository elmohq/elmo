// Constants for prompt processing
export const RUNS_PER_PROMPT = 5;

export const DEFAULT_DELAY_HOURS = 72;

// Maximum limits for brand resources
export const MAX_COMPETITORS = 100;

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
