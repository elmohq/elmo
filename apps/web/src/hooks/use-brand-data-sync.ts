import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { onBrandDataChange, syncBrandData } from "@/lib/brand-data/client";

const DEFAULT_SYNC_SECONDS = 60;
const MIN_FOCUS_SYNC_MS = 10_000;

/** Keeps the brand's data in step with the server, checking again when the server expects new data. */
export function useBrandDataSync(brandId: string | undefined) {
	const queryClient = useQueryClient();
	useEffect(() => {
		if (!brandId) return;
		let generation: number | undefined;
		let timer: number | undefined;
		let lastSync = 0;
		const sync = () => {
			window.clearTimeout(timer);
			lastSync = Date.now();
			syncBrandData(brandId);
		};
		const schedule = (seconds: number) => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				if (document.visibilityState === "visible") sync();
			}, seconds * 1000);
		};
		const unsubscribe = onBrandDataChange((changed, state) => {
			if (changed !== brandId) return;
			schedule(state.nextSyncInSeconds ?? DEFAULT_SYNC_SECONDS);
			if (state.generation === generation) return;
			generation = state.generation;
			queryClient.invalidateQueries({
				predicate: (query) => query.meta?.brandData === true && query.queryKey.includes(brandId),
			});
		});
		const onVisible = () => {
			if (document.visibilityState === "visible" && Date.now() - lastSync > MIN_FOCUS_SYNC_MS) sync();
		};
		sync();
		schedule(DEFAULT_SYNC_SECONDS);
		window.addEventListener("focus", onVisible);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			unsubscribe();
			window.clearTimeout(timer);
			window.removeEventListener("focus", onVisible);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [brandId, queryClient]);
}
