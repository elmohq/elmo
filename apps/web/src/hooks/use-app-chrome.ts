import { useMatches, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { type AppChrome, selectAppChrome } from "@/lib/app-chrome";

/**
 * One shell reads this instead of each layout rendering its own, so moving
 * between a brand, its organization, and the admin section keeps the same
 * sidebar and header mounted rather than tearing one down to build the other.
 *
 * A navigation still in flight can put a rail-less route on screen for a
 * moment: a redirect passing through the organization's home, or a page the
 * user left before it finished loading. The shell comes down only once the
 * destination has settled, so a moment like that does not blink it.
 */
export function useAppChrome(): AppChrome | null {
	const chrome = useMatches({ select: selectAppChrome });
	const isLoading = useRouterState({ select: (state) => state.isLoading });
	const shown = useRef<AppChrome | null>(chrome);
	const held = chrome ?? (isLoading ? shown.current : null);

	useEffect(() => {
		shown.current = held;
	});

	return held;
}
