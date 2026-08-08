/**
 * React hook for checking domains against the pay-to-win marketplace bloom filter.
 */
import { useEffect, useMemo, useState } from "react";
import {
	isMarketplaceDomainSync,
	whenReady,
} from "@/lib/marketplace-domains";

/**
 * Hook that loads the marketplace bloom filter and returns results.
 *
 * Returns `{ ready: false, set: Set() }` until the bloom filter finishes
 * loading, then `{ ready: true, set: Set(matching domains) }`.
 * This distinguishes "still loading" from "loaded but no matches".
 */
export function useMarketplaceDomains(domains: string[]): {
	ready: boolean;
	set: Set<string>;
} {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") return;
		let cancelled = false;
		whenReady().then(() => {
			if (!cancelled) setReady(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const set = useMemo(() => {
		if (!ready) return new Set<string>();
		const results = new Set<string>();
		for (const d of domains) {
			const normalized = d.toLowerCase();
			if (isMarketplaceDomainSync(normalized)) {
				results.add(normalized);
			}
		}
		return results;
	}, [ready, domains]);

	return { ready, set };
}