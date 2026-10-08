/**
 * Mock for @/server/prompt-suggestions. Stories set what a run returns, how
 * long it takes, and whether starting one is refused (the daily limit).
 */
import type { OnboardingPrompt } from "@workspace/lib/onboarding";

let _prompts: OnboardingPrompt[] = [];
let _delayMs = 0;
let _startError: string | null = null;
let _remaining = 4;
let _readyAt = 0;

export function setMockPromptSuggestions(prompts: OnboardingPrompt[]) {
	_prompts = prompts;
}

export function setMockPromptSuggestionsDelay(ms: number) {
	_delayMs = ms;
}

export function setMockPromptSuggestionsStartError(message: string | null) {
	_startError = message;
}

export function setMockPromptSuggestionsRemaining(remaining: number) {
	_remaining = remaining;
}

export const startPromptSuggestionsFn = async (_args: { data: unknown }) => {
	if (_startError) throw new Error(_startError);
	_readyAt = Date.now() + _delayMs;
	return { remaining: _remaining };
};

export const getPromptSuggestionsStatusFn = async (_args: { data: unknown }) => {
	if (Date.now() < _readyAt) return { status: "pending" as const };
	return { status: "done" as const, prompts: _prompts };
};

export const cancelPromptSuggestionsFn = async (_args: { data: unknown }) => ({ ok: true as const });
