/**
 * Mock for @/server/brands used in Storybook stories. Provides stubs for
 * every server function exported by the real module so the route tree can
 * be bundled, plus knobs that BrandOnboarding stories use to drive delays
 * and errors against `createBrandFn`.
 */
let _delayMs = 0;
let _shouldThrow: string | null = null;
let _platformState: {
	available: { model: string; provider: string; version?: string; webSearch: boolean }[];
	platformPicks: number;
	defaultSelected: string[];
} | null = null;

export function setMockCreateBrandDelay(ms: number) {
	_delayMs = ms;
}

export function setMockCreateBrandError(message: string | null) {
	_shouldThrow = message;
}

export function setMockOnboardingPlatformState(state: typeof _platformState) {
	_platformState = state;
}

export const getOnboardingPlatformStateFn = async (_args: { data: unknown }) => _platformState;

export const getBrand = async (_args: { data: unknown }) => null;

/** Stub re-exported by server-platform-picks.ts */
export const getModelPickerStateFn = async (_args: { data: unknown }) => null;

/** Stub re-exported by server-platform-picks.ts */
export const updateEnabledModelsFn = async (_args: { data: unknown }) => ({ id: "", enabledModels: null });

export const createBrandFn = async (_args: { data: unknown }) => {
	if (_delayMs > 0) await new Promise((r) => setTimeout(r, _delayMs));
	if (_shouldThrow) throw new Error(_shouldThrow);
	return { id: "mock-brand-id", success: true };
};

export const createBrandInOrgFn = async (_args: { data: unknown }) => {
	if (_delayMs > 0) await new Promise((r) => setTimeout(r, _delayMs));
	if (_shouldThrow) throw new Error(_shouldThrow);
	return { brandId: "mock-brand-id" };
};

export const updateBrandFn = async (_args: { data: unknown }) => ({ success: true });

export const getCompetitors = async (_args: { data: unknown }) => [];

export const updateCompetitors = async (_args: { data: unknown }) => ({ success: true });

export const addDomainToBrandFn = async (_args: { data: unknown }) => ({ success: true });

export const addDomainToCompetitorFn = async (_args: { data: unknown }) => ({ success: true });

export const createCompetitorFromDomainFn = async (_args: { data: unknown }) => ({ success: true });
