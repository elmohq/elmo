import { useMatches, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { type ShellScope, selectShellScope } from "@/lib/shell-scope";

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
