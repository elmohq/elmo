/**
 * A citations page asks for the same brand-wide aggregate from several cards at
 * once. Sharing the read between concurrent requests keeps that to one pass over
 * the brand's data instead of one per card.
 */
const SHARED_READ_TTL_MS = 30_000;
const MAX_SHARED_READS = 50;

type Reads = Map<string, { expiresAt: number; value: Promise<unknown> }>;
const owners = new WeakMap<object, Reads>();

/** Shares `read` between callers asking `owner` for the same `key` within a short window. */
export function sharedRead<T>(owner: object, key: string, read: () => Promise<T>): Promise<T> {
	let reads = owners.get(owner);
	if (!reads) {
		reads = new Map();
		owners.set(owner, reads);
	}
	const now = Date.now();
	for (const [k, entry] of reads) if (entry.expiresAt <= now) reads.delete(k);
	const cached = reads.get(key);
	if (cached) return cached.value as Promise<T>;
	const value = read();
	if (reads.size >= MAX_SHARED_READS) reads.delete(reads.keys().next().value as string);
	reads.set(key, { expiresAt: now + SHARED_READ_TTL_MS, value });
	const shared = reads;
	value.catch(() => shared.delete(key));
	return value;
}

export function clearSharedReads(owner: object) {
	owners.get(owner)?.clear();
}
