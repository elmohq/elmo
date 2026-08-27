/**
 * Every route under `routes/api/v1` must be built with `createApiHandler`.
 *
 * The deployment middleware can only check that a bearer is present — resolving
 * one needs a database lookup, and that middleware is pure and synchronous — so
 * the factory is where a caller is actually identified and their scopes
 * checked. Nothing else enforces that a route uses it, which makes this test
 * the only thing standing between a newly added file and an endpoint that
 * answers to anyone.
 *
 * So it imports each route and reads the handler map the router will actually
 * serve, keyed on a stamp only `createApiHandler` can apply. Reading the source
 * for `createApiHandler(` instead would pass on a file that calls it and then
 * exports something else.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import spec from "@workspace/api-spec";
import { describe, expect, it } from "vitest";
import { type ApiHandlerMeta, apiHandlerMeta } from "../handler";

const V1_ROOT = join(import.meta.dirname, "../../../routes/api/v1");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Every file under the tree that answers HTTP, `.tsx` included — a route that
 * serves an endpoint from a `.tsx` file is still an endpoint. Files with no
 * `handlers` block aren't endpoints at all (the docs path is a redirect), and
 * nothing below applies to them.
 */
function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return routeFiles(full);
		if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) return [];
		return readFileSync(full, "utf8").includes("handlers:") ? [full] : [];
	});
}

/** The route file's path on disk is the URL it answers for; `$id` is `{id}`. */
function pathForRoute(file: string): string {
	const route = file.slice(V1_ROOT.length + 1).replace(/\.tsx?$/, "");
	const trimmed = route.replace(/\/index$/, "").replace(/^index$/, "");
	return trimmed === "" ? "" : `/${trimmed}`.replace(/\$(\w+)/g, "{$1}");
}

/** What the router will serve, straight off the module the app imports. */
async function handlersOf(file: string): Promise<Record<string, unknown>> {
	const mod = (await import(/* @vite-ignore */ file)) as Record<
		string,
		{ options?: { server?: { handlers?: unknown } } }
	>;
	for (const value of Object.values(mod)) {
		const handlers = value?.options?.server?.handlers;
		if (handlers && typeof handlers === "object") return handlers as Record<string, unknown>;
	}
	throw new Error(`${file} exports no server handlers`);
}

const files = routeFiles(V1_ROOT);
// The catch-all answers for paths nothing else claimed; it maps to no operation.
const CATCH_ALL = join(V1_ROOT, "$.ts");

const loaded = await Promise.all(
	files.map(async (file) => ({
		name: file.slice(V1_ROOT.length + 1),
		file,
		path: pathForRoute(file),
		handlers: await handlersOf(file),
	})),
);

function documentedOperations(): string[] {
	const operations: string[] = [];
	for (const [path, methods] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
		for (const method of Object.keys(methods)) {
			if ((HTTP_METHODS as readonly string[]).includes(method.toUpperCase())) {
				operations.push(`${method.toUpperCase()} ${path}`);
			}
		}
	}
	return operations;
}

describe("/api/v1 route conformance", () => {
	it("finds the routes at all", () => {
		// Guards against the whole suite silently passing because the directory
		// moved and every check below iterated an empty list.
		expect(files.length).toBeGreaterThan(10);
	});

	it.each(loaded.map((route) => [route.name, route] as const))(
		"%s authenticates every verb through createApiHandler",
		(_name, route) => {
			const unstamped = Object.entries(route.handlers)
				.filter(([, handler]) => apiHandlerMeta(handler) === undefined)
				.map(([method]) => method);
			expect(unstamped, "verbs wired to something other than createApiHandler").toEqual([]);
		},
	);

	it.each(loaded.map((route) => [route.name, route] as const))(
		"%s rejects the verbs it does not implement",
		(_name, route) => {
			// Without the guard, a method no handler claims falls through the file
			// router to the SPA and answers 200 with HTML.
			expect(Object.keys(route.handlers).sort()).toEqual([...HTTP_METHODS].sort());
		},
	);

	it.each(loaded.filter((route) => route.file !== CATCH_ALL).map((route) => [route.name, route] as const))(
		"%s enforces the authorization its spec documents",
		(_name, route) => {
			// The spec is what a caller reads to decide which scopes to put on a
			// key. If it asks for less than the route enforces their key 403s on
			// an endpoint they were told it covered; if it asks for more, the
			// documented scope is security theatre. Neither side is checked by a
			// route's own tests, and both are one careless edit away.
			//
			// An empty list is a real answer — /me and /platforms are reachable by
			// any valid key on purpose — so it is compared, not waived.
			const documented: Record<string, unknown> = {};
			const enforced: Record<string, unknown> = {};
			for (const method of HTTP_METHODS) {
				const meta = apiHandlerMeta(route.handlers[method]) as ApiHandlerMeta | undefined;
				if (meta?.kind !== "endpoint") continue;
				const operation = (spec.paths as Record<string, Record<string, Record<string, unknown>>>)[route.path]?.[
					method.toLowerCase()
				];
				documented[method] = {
					scopes: [...((operation?.["x-elmo-scopes"] as string[] | undefined) ?? [])].sort(),
					adminOnly: operation?.["x-elmo-admin-only"] === true,
				};
				enforced[method] = { scopes: [...meta.scopes].sort(), adminOnly: meta.adminOnly };
			}
			expect(enforced).toEqual(documented);
		},
	);

	it.each(loaded.map((route) => [route.name, route] as const))(
		"%s scopes whatever it reads to the caller",
		(_name, route) => {
			// A route that queries directly has to decide what the caller may see.
			// The helpers in lib/api/scope are the only place that decision is made.
			//
			// Unlike the checks above this one reads source, because "the rows this
			// returned belong to the caller" isn't visible in the handler map. It
			// catches a route that forgot; the Bruno suite's cross-tenant cases are
			// what actually demonstrate the rows are filtered.
			const source = readFileSync(route.file, "utf8");
			if (!source.includes('from "@workspace/lib/db/db"')) return;
			const scoped = source.includes('from "@/lib/api/scope"');
			const adminOnly = Object.values(route.handlers).some((h) => apiHandlerMeta(h)?.adminOnly === true);
			expect(scoped || adminOnly, "queries the database without scoping to the caller").toBe(true);
		},
	);

	it("documents exactly the operations it implements", () => {
		// An endpoint missing from the spec is a surface nobody reviews and no
		// client knows to use; one in the spec that doesn't exist is a 404 with
		// documentation. Neither shows up in a route's own tests.
		const implemented = loaded
			.filter((route) => route.file !== CATCH_ALL)
			.flatMap((route) =>
				Object.entries(route.handlers)
					.filter(([, handler]) => apiHandlerMeta(handler)?.kind === "endpoint")
					.map(([method]) => `${method} ${route.path}`),
			);
		expect(documentedOperations().sort()).toEqual(implemented.sort());
	});
});
