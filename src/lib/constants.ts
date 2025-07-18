// Constants for prompt processing
export const RUNS_PER_PROMPT = 1;

// Model configurations
export const AI_MODELS = {
  OPENAI: {
    GROUP: "openai" as const,
    MODEL: "gpt-4o-mini",
  },
  ANTHROPIC: {
    GROUP: "anthropic" as const,
    MODEL: "claude-sonnet-4-20250514",
  },
} as const; 
