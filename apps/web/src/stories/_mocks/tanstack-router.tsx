/**
 * Mock for @tanstack/react-router used in Storybook stories.
 * Provides stubs for the router hooks and components that the app uses.
 */
import React, { createContext, useContext, type ReactNode } from "react";
import type { ClientConfig } from "@workspace/config/types";
// NOTE: We intentionally do NOT re-export from deep imports of
// `@tanstack/react-router` here. Storybook's build adds custom resolution
// conditions and TanStack Start applies import protection, which makes deep
// imports like `@tanstack/react-router/dist/esm` fail under Storybook.

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

export function useRouter() {
	return {
		navigate: (_opts: unknown) => {},
		state: { location: { pathname: "/", search: "", hash: "" } },
	};
}

export function isRedirect(_error: unknown): _error is never {
	return false;
}

export function RouterProvider(_props: { router: unknown }) {
	return null;
}

export const Link = React.forwardRef<HTMLButtonElement, any>(function LinkMock(
	{ to, children, onClick, ...props },
	ref,
) {
	return (
		<button
			type="button"
			ref={ref}
			onClick={onClick}
			{...props}
		>
			{children}
		</button>
	);
});

// ---------------------------------------------------------------------------
// Additional exports required for building Storybook.
// These are intentionally minimal and are only meant to make isolated stories
// compile; they are not full router implementations.
// ---------------------------------------------------------------------------

export function Await(props: { children?: ReactNode }) {
	return <>{props.children}</>;
}

export function HeadContent() {
	return null;
}

export function Outlet() {
	return null;
}

export function Scripts() {
	return null;
}

export function redirect(_opts: unknown) {
	// In the real router this returns a special response/error. For Storybook we
	// just throw to prevent accidental execution paths.
	throw new Error("redirect() called in Storybook mock");
}

export function notFound(_opts?: unknown): never {
	throw new Error("notFound() called in Storybook mock");
}

export function createRouter(_opts: unknown) {
	return {};
}

export function createFileRoute(_path: string) {
	return (_opts: any) => ({
		..._opts,
		useParams: () => ({ brand: "mock-brand-id", promptId: "mock-prompt-id" }),
	});
}

export function createRootRouteWithContext<_T>() {
	return (_opts: any) => _opts;
}

export function lazyRouteComponent(_importer: any) {
	return () => null;
}
