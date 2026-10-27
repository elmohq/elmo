import { CLICK_ID_PARAMS, type SignupAttribution, sanitizeAttribution } from "@workspace/config/signup-attribution";
import type { DeploymentMode } from "@workspace/config/types";
import type { NewUserSignupAttribution } from "@workspace/lib/db/schema";

export const SIGNUP_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function acceptsSignupAttribution(input: {
	mode: DeploymentMode;
	userCreatedAt: Date | string;
	impersonatedBy?: string | null;
	now: Date;
}): boolean {
	if (input.mode !== "cloud" || input.impersonatedBy) return false;
	const age = input.now.getTime() - new Date(input.userCreatedAt).getTime();
	return Number.isFinite(age) && age <= SIGNUP_ATTRIBUTION_WINDOW_MS;
}

export function signupAttributionRow(userId: string, input: unknown): NewUserSignupAttribution | null {
	const attribution: SignupAttribution = sanitizeAttribution(input);
	const clickIds = Object.fromEntries(
		CLICK_ID_PARAMS.flatMap((key) => (attribution[key] ? [[key, attribution[key]]] : [])),
	);
	const row: NewUserSignupAttribution = {
		userId,
		ref: attribution.ref ?? null,
		utmSource: attribution.utm_source ?? null,
		utmMedium: attribution.utm_medium ?? null,
		utmCampaign: attribution.utm_campaign ?? null,
		utmTerm: attribution.utm_term ?? null,
		utmContent: attribution.utm_content ?? null,
		clickIds: Object.keys(clickIds).length > 0 ? clickIds : null,
		landingPage: attribution.landing_page ?? null,
		referrer: attribution.referrer ?? null,
	};
	return Object.entries(row).some(([key, value]) => key !== "userId" && value !== null) ? row : null;
}
