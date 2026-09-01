import type { DeploymentMode } from "@workspace/config/types";

/** The auth pages a visitor can be sent to from the bare app URL. */
export type EntryRoute = "/auth/login" | "/auth/register";

interface EntryConfig {
	mode: DeploymentMode;
	canRegister: boolean;
	hasUsers: boolean;
}

/**
 * Where a signed-out visitor to `/` belongs, or null to leave them on the home
 * page.
 *
 * The bare app URL is typed and linked to, so it should open the thing the
 * visitor came for rather than a card with one button on it. Which page that
 * is depends on what the deployment is for:
 *
 * - cloud sells accounts, so sign-up — it carries the pitch, and it is where
 *   the marketing site points anyone who wants to buy
 * - local is one operator's instance: sign-in, or sign-up while the single
 *   account it will ever hold has yet to be created
 * - demo puts the shared credentials on sign-in, ready to submit
 *
 * Whitelabel is the exception. Its sign-in page hands off to the partner's
 * identity provider the moment it renders, so redirecting there would start an
 * SSO round trip nobody asked for — the visitor clicks first.
 */
export function entryRouteForVisitor(config: EntryConfig | undefined): EntryRoute | null {
	if (!config || config.mode === "whitelabel") return null;
	if (config.canRegister && (config.mode === "cloud" || !config.hasUsers)) return "/auth/register";
	return "/auth/login";
}
