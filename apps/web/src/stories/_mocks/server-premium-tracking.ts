/**
 * Mock for @/server/premium-tracking used in Storybook stories. The real module
 * reads the org's entitlements; stories supply the pool totals their pages
 * render. Which prompts spend the pool is saved through @/server/prompts, so
 * there is no write path here.
 */

export const getPremiumPoolFn = async (_args?: { data: unknown }) => ({
	available: false,
	assigned: 0,
	total: 0,
});
