/**
 * Mock for @/server/platform-picks used in Storybook stories.
 *
 * The shared mutable `_platformState` and `getOnboardingPlatformStateFn`
 * live in server-brands.ts (where the story knobs and the old alias both
 * live). Re-export here so the new @/server/platform-picks alias finds the
 * same mocks that setMockOnboardingPlatformState drives.
 */
export {
	getModelPickerStateFn,
	getOnboardingPlatformStateFn,
	setMockOnboardingPlatformState,
	updateEnabledModelsFn,
} from "./server-brands";
