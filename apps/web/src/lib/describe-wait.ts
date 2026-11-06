/** "12 minutes" / "3 hours" until `until`, for rate-limit messages. Never less than a minute. */
export function describeWait(until: Date): string {
	const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	const hours = Math.ceil(minutes / 60);
	return `${hours} hour${hours === 1 ? "" : "s"}`;
}
