/**
 * Unique keys for editor list rows. `crypto.randomUUID` only exists in secure
 * contexts, so self-hosted deployments served over plain HTTP crash on it —
 * these keys never leave the page, so a counter is just as good a fallback.
 */
let counter = 0;

export function newEntryKey(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	counter += 1;
	return `entry-${counter}-${Math.random().toString(36).slice(2)}`;
}
