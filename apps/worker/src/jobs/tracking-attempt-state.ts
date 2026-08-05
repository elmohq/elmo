export type ProviderAttemptState = "reserved" | "started" | "succeeded" | "failed" | "canceled";

export type AttemptRecoveryDisposition = "retry-later" | "release-reservation" | "retain-charge" | "terminal";

/**
 * A reserved attempt proves provider I/O never started, so its quota can be
 * returned. Once started, an interrupted call is ambiguous and stays billed.
 */
export function getAttemptRecoveryDisposition(
	status: ProviderAttemptState,
	claimExpired: boolean,
): AttemptRecoveryDisposition {
	if ((status === "reserved" || status === "started") && !claimExpired) return "retry-later";
	if (status === "reserved") return "release-reservation";
	if (status === "started") return "retain-charge";
	return "terminal";
}
