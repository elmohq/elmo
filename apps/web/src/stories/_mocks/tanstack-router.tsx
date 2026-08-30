/**
 * Mock for @tanstack/react-router used in Storybook stories.
 * Provides stubs for the router hooks and components that the app uses.
 */
import React, { createContext, type ReactNode, useContext } from "react";

// This mock is used for Storybook bundling. It intentionally provides a broad
// surface-area of exports to satisfy app imports without pulling in a real router.

// ---------------------------------------------------------------------------
// Settable route context — stories call setMockRouteContext() before rendering
// ---------------------------------------------------------------------------

const RouteCtx = createContext<Record<string, unknown>>({});

const BASE_ROUTE_CONTEXT: Record<string, unknown> = {
	brandId: "mock-brand-id",
	organization: {
		id: "org-1",
		slug: "mock-organization",
		name: "Acme",
		brandCreation: { kind: "allowed" },
		brands: [{ id: "mock-brand-id", slug: null, name: "Acme Corp", website: "https://acme.com", onboarded: true }],
	},
};

let _routeContext: Record<string, unknown> = {};

export function setMockRouteContext(ctx: Record<string, unknown>) {
	_routeContext = ctx;
}

/**
 * Wraps story content so that useRouteContext returns the provided value.
 */
export function MockRouteContextProvider({ value, children }: { value: Record<string, unknown>; children: ReactNode }) {
	return <RouteCtx.Provider value={value}>{children}</RouteCtx.Provider>;
}

// ---------------------------------------------------------------------------
// Stubs for @tanstack/react-router exports used by app components
// ---------------------------------------------------------------------------

export function useRouteContext(opts?: { select?: (context: Record<string, unknown>) => unknown }) {
	const ctx = useContext(RouteCtx);
	// Merge with module-level context so both approaches work
	const merged = { ...BASE_ROUTE_CONTEXT, ..._routeContext, ...ctx };
	return opts?.select ? opts.select(merged) : merged;
}

export function createRouter(_opts?: unknown) {
	return {
		state: { location: { pathname: "/", search: "", hash: "" } },
		navigate: (_next: unknown) => {},
	};
}

export function createFileRoute(_path: string) {
	return (config: any) => ({
		...config,
		// Mirror the real Route shape so stories can render a route's component via
		// Route.options.component (without the route file having to export it).
		options: config,
		useParams: () => ({ org: "mock-organization", brand: "mock-brand-id" }),
		useSearch,
		useNavigate,
		useLoaderData,
		useRouteContext,
	});
}

// ---------------------------------------------------------------------------
// Settable loader data — for stories that render a route's component directly
// (Route.options.component) instead of a plain presentational component. The
// route's loader never runs in Storybook, so the story supplies its result.
// ---------------------------------------------------------------------------

let _loaderData: unknown;

export function setMockLoaderData(data: unknown) {
	_loaderData = data;
}

export function useLoaderData(opts?: { select?: (data: any) => unknown }) {
	return opts?.select ? opts.select(_loaderData) : (_loaderData as any);
}

export function createRootRouteWithContext<TContext>() {
	return (_opts: any) => {
		// Root route component isn't needed in stories; only exports must exist.
		return {} as any as TContext;
	};
}

export function useParams(_opts?: unknown) {
	return { org: "mock-organization", brand: "mock-brand-id" };
}

export function useNavigate() {
	return (_opts: unknown) => {
		/* noop */
	};
}

export function useLocation() {
	return { pathname: "/app/org/mock-organization/brand/mock-brand-id", search: "", hash: "" };
}

// Stories never navigate, so the blocker is always idle.
export function useBlocker(_opts?: unknown) {
	return {
		status: "idle",
		current: undefined,
		next: undefined,
		action: undefined,
		proceed: undefined,
		reset: undefined,
	};
}

// Stories render with an empty search (all filters at defaults) unless one sets
// it — /choose-plan reads `?status=success` to know it came back from Stripe.
// Honor `select` so per-key subscribers (filter-bar widgets) get `undefined`
// instead of the whole empty object.
let _search: Record<string, unknown> = {};

export function setMockSearch(search: Record<string, unknown>) {
	_search = search;
}

export function useSearch(opts?: { select?: (search: Record<string, unknown>) => unknown }) {
	return opts?.select ? opts.select(_search) : _search;
}

export function useMatch(_opts?: unknown) {
	return { params: { org: "mock-organization", brand: "mock-brand-id" } };
}

let _matches: Array<{
	routeId: string;
	pathname: string;
	staticData: { crumb?: string };
	context?: unknown;
	loaderData?: unknown;
}> = [
	{
		routeId: "/_authed/app/org/$org",
		pathname: "/app/org/mock-organization",
		staticData: {},
		context: { organization: { name: "Acme" } },
	},
	{
		routeId: "/_authed/app/org/$org/brand/$brand",
		pathname: "/app/org/mock-organization/brand/mock-brand-id",
		staticData: {},
		loaderData: { brand: { name: "Acme Corp" } },
	},
];

export function setMockMatches(matches: typeof _matches) {
	_matches = matches;
}

export function useMatches() {
	return _matches;
}

function buildLocation({ to, params }: { to?: string; params?: Record<string, string> }) {
	const pathname = Object.entries(params ?? {}).reduce(
		(path, [key, value]) => path.replace(`$${key}`, encodeURIComponent(value)),
		to ?? "/",
	);
	return { pathname, search: "", searchStr: "", hash: "", href: pathname };
}

export function useRouter() {
	return {
		navigate: (_opts: unknown) => {},
		buildLocation,
		state: { location: { pathname: "/", search: "", hash: "" } },
	};
}

export function isRedirect(_error: unknown): _error is never {
	return false;
}

export function redirect(_opts: unknown): never {
	throw new Error("redirect() called in Storybook mock");
}

export function notFound(_opts?: unknown): never {
	throw new Error("notFound() called in Storybook mock");
}

export function RouterProvider(_props: { router: unknown }) {
	return null;
}

export function Outlet() {
	return null;
}

export function Scripts() {
	return null;
}

export function ScriptOnce(_props: { children?: unknown }) {
	return null;
}

export function HeadContent() {
	return null;
}

export function Await(_props: any) {
	return null;
}

export function lazyRouteComponent(loader: any) {
	// In real TanStack Router this returns a lazy component; for stories we can
	// just return a function component that renders nothing.
	// Some code paths may call the loader eagerly; guard it.
	return function LazyRouteComponentMock(_props: any) {
		if (typeof loader === "function") {
			try {
				void loader();
			} catch {
				// ignore
			}
		}
		return null;
	};
}

export const Link = React.forwardRef<HTMLButtonElement, any>(function LinkMock(
	{ to, children, onClick, ...props },
	ref,
) {
	return (
		<button type="button" ref={ref} onClick={onClick} {...props}>
			{children}
		</button>
	);
});
