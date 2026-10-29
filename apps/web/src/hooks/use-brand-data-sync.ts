import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onBrandDataChange, syncBrandData } from "@/lib/brand-data/client";

const SYNC_INTERVAL_MS = 60_000;

export function useBrandDataSync(brandId: string | undefined) {
	const queryClient = useQueryClient();
	useEffect(() => {
		if (!brandId) return;
		const sync = () => syncBrandData(brandId);
		const unsubscribe = onBrandDataChange((changed) => {
			if (changed === brandId)
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
