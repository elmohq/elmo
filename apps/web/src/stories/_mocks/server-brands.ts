/**
 * Mock for @/server/brands used in Storybook stories. Currently only stubs
 * `createBrandFn` (used by BrandOnboarding); add more re-exports here as
 * stories grow into other consumers of @/server/brands.
 */
let _delayMs = 0;
let _shouldThrow: string | null = null;

export function setMockCreateBrandDelay(ms: number) {
	_delayMs = ms;
}

export function setMockCreateBrandError(message: string | null) {
	_shouldThrow = message;
}

export const createBrandFn = async (_args: { data: unknown }) => {
	if (_delayMs > 0) await new Promise((r) => setTimeout(r, _delayMs));
	if (_shouldThrow) throw new Error(_shouldThrow);
	return { id: "mock-brand-id", success: true };
};
