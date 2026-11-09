/**
 * Run `fn` over `items` with at most `concurrency` in flight at once. Results
 * are returned in input order. Rejections propagate (callers that want
 * per-item error capture should catch inside `fn`).
 */
export async function mapPool<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const limit = Math.max(1, Math.min(concurrency, items.length || 1));

	async function worker(): Promise<void> {
		while (true) {
			const index = next++;
			if (index >= items.length) return;
			results[index] = await fn(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: limit }, () => worker()));
	return results;
}
