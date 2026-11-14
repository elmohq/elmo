export type DbWatchdogOptions = {
	probes: Record<string, () => Promise<unknown>>;
	onUnhealthy: (pool: string, lastError: unknown) => void;
	intervalMs?: number;
	probeTimeoutMs?: number;
	unhealthyAfterMs?: number;
};

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(`database probe timed out after ${ms}ms`)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Probes each pool with a round trip and calls onUnhealthy once a pool has gone
 * unhealthyAfterMs without one succeeding, so a process whose pool can't heal
 * gets replaced instead of failing every job indefinitely.
 */
export function startDbWatchdog({
	probes,
	onUnhealthy,
	intervalMs = 30_000,
	probeTimeoutMs = 20_000,
	unhealthyAfterMs = 5 * 60_000,
}: DbWatchdogOptions): () => void {
	const lastHealthyAt = new Map(Object.keys(probes).map((pool) => [pool, Date.now()]));
	let stopped = false;

	const check = (pool: string, probe: () => Promise<unknown>) =>
		withTimeout(Promise.resolve().then(probe), probeTimeoutMs).then(
			() => {
				lastHealthyAt.set(pool, Date.now());
			},
			(error) => {
				if (stopped) return;
				if (Date.now() - (lastHealthyAt.get(pool) ?? 0) < unhealthyAfterMs) return;
				stop();
				onUnhealthy(pool, error);
			},
		);

	const interval = setInterval(() => {
		for (const [pool, probe] of Object.entries(probes)) void check(pool, probe);
	}, intervalMs);
	interval.unref?.();

	function stop() {
		stopped = true;
		clearInterval(interval);
	}
	return stop;
}
