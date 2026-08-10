/**
 * Mock for @/server/billing used in Storybook stories. The real module reaches
 * Stripe and the entitlements tables; stories drive the shapes its callers
 * render and the one write path (the extra premium pairings add-on).
 */

let _addonError: string | null = null;
let _addonDelayMs = 0;

/** Make the add-on save fail, so stories can show the card's error state. */
export function setMockAddonError(message: string | null) {
	_addonError = message;
}

export function setMockAddonDelay(ms: number) {
	_addonDelayMs = ms;
}

export const getBillingStateFn = async (_args?: { data: unknown }) => undefined;

export const getPaywallStateFn = async (_args?: { data?: { organizationId?: string } }) => ({ needsPlan: false });

export const setPremiumAddonQuantityFn = async (args: { data: { quantity: number } }) => {
	if (_addonDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, _addonDelayMs));
	if (_addonError) throw new Error(_addonError);
	return { quantity: args.data.quantity };
};
