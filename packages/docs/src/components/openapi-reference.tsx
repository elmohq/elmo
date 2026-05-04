"use client";

import { lazy, Suspense, useEffect } from "react";

const ApiReferenceReact = lazy(() =>
	Promise.all([
		import("@scalar/api-reference-react"),
		import("@scalar/api-reference-react/style.css"),
	]).then(([mod]) => ({
		default: mod.ApiReferenceReact,
	})),
);

/**
 * Scalar's intersection-observer scrollspy fires `history.replaceState` on
 * every section boundary as the user scrolls. On a long doc that bursts
 * past Chrome's per-frame history-API budget (~100 calls / 30s — see
 * crbug.com/1038223), at which point the browser starts throttling and the
 * page jumps around. Scalar exposes no config to disable this.
 *
 * Throttle replaceState while the component is mounted: coalesce bursts so
 * the URL still settles on the visible section, just at most once every
 * 500ms. Pure URL state — no functional cost.
 */
function useThrottledReplaceState(intervalMs = 500) {
	useEffect(() => {
		const original = window.history.replaceState;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let pendingArgs: Parameters<typeof original> | null = null;

		window.history.replaceState = function (...args) {
			pendingArgs = args;
			if (timer !== null) return;
			timer = setTimeout(() => {
				if (pendingArgs) original.apply(window.history, pendingArgs);
				timer = null;
				pendingArgs = null;
			}, intervalMs);
		};

		return () => {
			if (timer !== null) {
				clearTimeout(timer);
				if (pendingArgs) original.apply(window.history, pendingArgs);
			}
			window.history.replaceState = original;
		};
	}, [intervalMs]);
}

export function OpenApiReference() {
	useThrottledReplaceState();

	return (
		<Suspense
			fallback={
				<div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
					Loading API Reference...
				</div>
			}
		>
			<div className="not-prose -mx-4 md:-mx-6">
				<ApiReferenceReact
					configuration={{
						url: "/api/openapi.json",
						layout: "modern",
						theme: "default",
						darkMode: false,
						forceDarkModeState: "light",
						hideDarkModeToggle: true,
						hideSearch: true,
						showSidebar: false,
						defaultOpenAllTags: true,
						defaultHttpClient: {
							targetKey: "node",
							clientKey: "fetch",
						},
						agent: {
							disabled: true,
						},
					}}
				/>
			</div>
		</Suspense>
	);
}
