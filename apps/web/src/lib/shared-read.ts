/**
 * A citations page asks for the same brand-wide aggregate from several cards at
 * once (the domain list, the flow picker, Google Shopping's two lists). Sharing
 * the read between requests that land on the same server keeps that to one pass
 * over the brand's rollups instead of one per card.
 */
const reads = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

const SHARED_READ_TTL_MS = 30_000;
const MAX_SHARED_READS = 50;

export function sharedRead<T>(key: string, read: () => Promise<T>): Promise<T> {
	const now = Date.now();
	for (const [k, entry] of reads) if (entry.expiresAt <= now) reads.delete(k);
	const cached = reads.get(key);
	if (cached) return cached.value as Promise<T>;
	const value = read();
	if (reads.size >= MAX_SHARED_READS) reads.delete(reads.keys().next().value as string);
	reads.set(key, { expiresAt: now + SHARED_READ_TTL_MS, value });
	value.catch(() => reads.delete(key));
	return value;
}
