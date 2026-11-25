// pg-boss tags each worker's errors with its queue and worker id, so the same
// outage would otherwise count as a distinct error per worker.
const WORKER_SUFFIX = / \(Queue: [^)]*, Worker: [^)]*\)$/;

function throttleKey(error: unknown): string {
	const message =
		typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
	return message.replace(WORKER_SUFFIX, "");
}

export function createErrorThrottle(options: { intervalMs?: number; now?: () => number } = {}) {
	const intervalMs = options.intervalMs ?? 60_000;
	const now = options.now ?? Date.now;
	const windows = new Map<string, { reportedAt: number; suppressed: number }>();

	return (error: unknown): { suppressed: number } | null => {
		const key = throttleKey(error);
		const time = now();
		const window = windows.get(key);
		if (window && time - window.reportedAt < intervalMs) {
			window.suppressed++;
			return null;
		}
		for (const [staleKey, stale] of windows) {
			if (time - stale.reportedAt >= intervalMs) windows.delete(staleKey);
		}
		windows.set(key, { reportedAt: time, suppressed: 0 });
		return { suppressed: window?.suppressed ?? 0 };
	};
}
