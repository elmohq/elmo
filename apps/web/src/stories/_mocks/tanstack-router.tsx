/**
 * Mock for @tanstack/react-router used in Ladle stories.
 * Provides stubs for the router hooks and components that the app uses.
 */
import React, { createContext, useContext, type ReactNode } from "react";
import type { ClientConfig } from "@workspace/config/types";

// ---------------------------------------------------------------------------
// Settable route context — stories call setMockRouteContext() before rendering
// ---------------------------------------------------------------------------

const RouteCtx = createContext<Record<string, unknown>>({});

let _routeContext: Record<string, unknown> = {};

export function setMockRouteContext(ctx: Record<string, unknown>) {
	_routeContext = ctx;
}

/**
 * Wraps story content so that useRouteContext returns the provided value.
 */
export function MockRouteContextProvider({
	value,
	children,
}: {
	value: Record<string, unknown>;
	children: ReactNode;
}) {
	return <RouteCtx.Provider value={value}>{children}</RouteCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Stubs for @tanstack/react-router exports used by app components
// ---------------------------------------------------------------------------

export function useRouteContext(_opts?: unknown) {
	const ctx = useContext(RouteCtx);
	// Merge with module-level context so both approaches work
	return { ..._routeContext, ...ctx };
}

export function useParams(_opts?: unknown) {
	return { brand: "mock-brand-id" };
}

export function useNavigate() {
	return (_opts: unknown) => {
		/* noop */
	};
}

export function useLocation() {
	return { pathname: "/app/mock-brand-id", search: "", hash: "" };
}

export function useSearch(_opts?: unknown) {
	return {};
}

export function useMatch(_opts?: unknown) {
	return { params: { brand: "mock-brand-id" } };
}

export const Link = React.forwardRef<HTMLAnchorElement, any>(function LinkMock(
	{ to, children, onClick, ...props },
	ref,
) {
	return (
		<a
			ref={ref}
			href={typeof to === "string" ? to : "#"}
			onClick={(e) => {
				e.preventDefault();
				onClick?.(e);
			}}
			{...props}
		>
			{children}
		</a>
	);
});
