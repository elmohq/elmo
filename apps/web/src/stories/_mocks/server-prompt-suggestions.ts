/**
 * Mock for @/server/prompt-suggestions. Stories set what a run returns, how
 * long it takes, and whether starting one is refused (the daily limit).
 */
import type { OnboardingPrompt } from "@workspace/lib/onboarding";

let _batches: OnboardingPrompt[][] = [[]];
let _runs = 0;
let _delayMs = 0;
let _startError: string | null = null;
let _remaining = 4;
let _readyAt = 0;

/** Each run returns the next batch, cycling, so "Suggest More" can bring new rows. */
export function setMockPromptSuggestions(...batches: OnboardingPrompt[][]) {
	_batches = batches;
	_runs = 0;
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
	_runs += 1;
	return { remaining: _remaining };
};

export const getPromptSuggestionsStatusFn = async (_args: { data: unknown }) => {
	if (Date.now() < _readyAt) return { status: "pending" as const };
	return { status: "done" as const, prompts: _batches[(_runs - 1) % _batches.length] ?? [] };
};

export const cancelPromptSuggestionsFn = async (_args: { data: unknown }) => ({ ok: true as const });
