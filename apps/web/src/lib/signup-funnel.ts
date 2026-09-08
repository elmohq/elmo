/**
 * Bridges the one gap in the signup funnel that no page can see on its own:
 * the email verification link opens in a fresh tab, so the page it lands on
 * has no idea a signup preceded it. The sign-up page leaves this marker, and
 * the first signed-in page consumes it to report the verification.
 */

const KEY = "elmo:signup-pending-verification";

export interface PendingVerification {
	ref?: string;
}

export function markVerificationPending(pending: PendingVerification): void {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(pending));
	} catch {
		// Private mode or a full store: the funnel loses one step, nothing else.
	}
}

/** Reads and clears the marker, so a verification is reported once. */
export function consumeVerificationPending(): PendingVerification | null {
	try {
		const raw = window.localStorage.getItem(KEY);
		if (!raw) return null;
		window.localStorage.removeItem(KEY);
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return {};
		const ref = (parsed as { ref?: unknown }).ref;
		return typeof ref === "string" ? { ref } : {};
	} catch {
		return null;
	}
}
