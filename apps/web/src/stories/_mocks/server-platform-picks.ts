/**
 * Mock for @/server/platform-picks used in Storybook stories.
 *
 * Re-export the shared state from server-brands so every import path observes
 * the values set by `setMockOnboardingPlatformState`.
 */
export {
	getModelPickerStateFn,
	getOnboardingPlatformStateFn,
	setMockOnboardingPlatformState,
	updateEnabledModelsFn,
} from "./server-brands";
