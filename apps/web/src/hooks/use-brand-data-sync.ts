import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onBrandDataChange, syncBrandData } from "@/lib/brand-data/sync";
import { clearSharedReads } from "@/lib/shared-read";

const SYNC_INTERVAL_MS = 60_000;

/** Keeps the brand's local data current and recomputes its pages whenever it changes. */
export function useBrandDataSync(brandId: string | undefined) {
	const queryClient = useQueryClient();
	useEffect(() => {
		if (!brandId) return;
		const sync = () => {
			syncBrandData(brandId).catch((error) => console.warn("[brand-data] sync failed", error));
		};
		const unsubscribe = onBrandDataChange((changed) => {
			if (changed !== brandId) return;
			clearSharedReads();
			queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(brandId) });
		});
		sync();
		const interval = window.setInterval(sync, SYNC_INTERVAL_MS);
		window.addEventListener("focus", sync);
		return () => {
			unsubscribe();
			window.clearInterval(interval);
			window.removeEventListener("focus", sync);
		};
	}, [brandId, queryClient]);
}
