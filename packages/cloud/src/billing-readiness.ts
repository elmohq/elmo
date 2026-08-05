export function createCloudBillingReadinessGate(input: {
	mode: string | undefined;
	validate: () => Promise<void>;
	retryAfterMs?: number;
	now?: () => number;
}): () => Promise<void> {
	const retryAfterMs = input.retryAfterMs ?? 30_000;
	const now = input.now ?? Date.now;
	let ready = false;
	let validation: Promise<void> | undefined;
	let lastError: unknown;
	let retryAt = 0;
	return async () => {
		if (input.mode !== "cloud") return;
		if (ready) return;
		if (!validation) {
			if (lastError !== undefined && now() < retryAt) throw lastError;
			validation = input
				.validate()
				.then(() => {
					ready = true;
					lastError = undefined;
				})
				.catch((error: unknown) => {
					lastError = error;
					retryAt = now() + retryAfterMs;
					throw error;
				})
				.finally(() => {
					validation = undefined;
				});
		}
		await validation;
	};
}
