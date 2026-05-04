/**
 * Mock for @/server/onboarding — lets stories drive the wizard's analyze and
 * save calls without hitting the real server functions (which transitively
 * pull in DB + provider clients).
 *
 * Stories call `setMockOnboardingSuggestion()` to control what the analyze
 * step returns, and `setMockOnboardingDelay()` to simulate slow analyses.
 */
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";

let _suggestion: OnboardingSuggestion | null = null;
let _delayMs = 0;
let _shouldThrow: string | null = null;

export function setMockOnboardingSuggestion(suggestion: OnboardingSuggestion | null) {
	_suggestion = suggestion;
}

export function setMockOnboardingDelay(ms: number) {
	_delayMs = ms;
}

export function setMockOnboardingError(message: string | null) {
	_shouldThrow = message;
}

export const analyzeBrandFn = async (_args: { data: unknown }) => {
	if (_delayMs > 0) await new Promise((r) => setTimeout(r, _delayMs));
	if (_shouldThrow) throw new Error(_shouldThrow);
	if (!_suggestion) {
		throw new Error("setMockOnboardingSuggestion() not called");
	}
	return _suggestion;
};

export const updateOnboardedBrandFn = async (_args: { data: unknown }) => {
	if (_delayMs > 0) await new Promise((r) => setTimeout(r, Math.min(_delayMs, 800)));
	return {
		brandId: "mock-brand-id",
		brandName: "Mock",
		website: "mock.com",
		additionalDomains: [],
		aliases: [],
		promptsCreated: 0,
		competitorsCreated: 0,
		suggestion: null,
	};
};

// Other re-exports from the real module so type-only imports resolve.
export type { OnboardingSuggestion } from "@workspace/lib/onboarding";
