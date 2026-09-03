import { useMatches, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { type ShellScope, selectShellScope } from "@/lib/shell-scope";

/**
 * One shell reads this instead of each layout rendering its own, so moving
 * between a brand, its organization, and the admin section keeps the same
 * sidebar and header mounted rather than tearing one down to build the other.
 *
 * A navigation still in flight can put a shell-less route on screen for a
 * moment: a redirect passing through the organization's home, or a page the
 * user left before it finished loading. The shell comes down only once the
 * destination has settled, so a moment like that does not blink it.
 */
export function useShellScope(): ShellScope | null {
	const scope = useMatches({ select: selectShellScope });
	const isLoading = useRouterState({ select: (state) => state.isLoading });
	const shown = useRef<ShellScope | null>(scope);
	const held = scope ?? (isLoading ? shown.current : null);

	useEffect(() => {
		shown.current = held;
	});

	return held;
}
