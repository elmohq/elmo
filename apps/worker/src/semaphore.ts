/**
 * Simple in-memory semaphore to limit concurrent operations.
 *
 * This is used during the migration period to limit concurrent API calls
 * while allowing many workflows to be in a sleeping state.
 *
 * TODO(post-migration): Once initialDelayHours is removed:
 * 1. Delete this file
 * 2. Remove semaphore usage from prompt-workflow.ts
 * 3. Reduce workerConcurrency in queues.ts to 10-20
 * 4. Optionally re-add rateLimit to the queue if needed
 */

class Semaphore {
	private permits: number;
	private waiting: Array<() => void> = [];

	constructor(permits: number) {
		this.permits = permits;
	}

	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--;
			return;
		}

		return new Promise<void>((resolve) => {
			this.waiting.push(resolve);
		});
	}

	release(): void {
		const next = this.waiting.shift();
		if (next) {
			next();
		} else {
			this.permits++;
		}
	}

	async withPermit<T>(fn: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	get available(): number {
		return this.permits;
	}

	get queueLength(): number {
		return this.waiting.length;
	}
}

/**
 * Limits concurrent API calls across all workflows in this worker instance.
 * Set to 10 to prevent overwhelming external APIs while allowing many
 * workflows to be sleeping.
 *
 * TODO(post-migration): Remove this - use workerConcurrency instead
 */
export const apiCallSemaphore = new Semaphore(10);
