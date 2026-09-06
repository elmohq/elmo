/**
 * Read off the handler map the router serves, keyed on a stamp only
 * `createApiHandler` applies: grepping the source would pass a file that calls
 * it and exports something else.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import spec from "@workspace/api-spec";
import { describe, expect, it } from "vitest";
import { type ApiHandlerMeta, apiHandlerMeta } from "../handler";

const V1_ROOT = join(import.meta.dirname, "../../../routes/api/v1");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return routeFiles(full);
		if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) return [];
		return readFileSync(full, "utf8").includes("handlers:") ? [full] : [];
	});
}

function pathForRoute(file: string): string {
	const route = file.slice(V1_ROOT.length + 1).replace(/\.tsx?$/, "");
	const trimmed = route.replace(/\/index$/, "").replace(/^index$/, "");
	return trimmed === "" ? "" : `/${trimmed}`.replace(/\$(\w+)/g, "{$1}");
}

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
		// Otherwise the suite passes when the directory moves and every check
		// below iterates an empty list.
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
			expect(Object.keys(route.handlers).sort()).toEqual([...HTTP_METHODS].sort());
		},
	);

	it.each(loaded.filter((route) => route.file !== CATCH_ALL).map((route) => [route.name, route] as const))(
		"%s enforces the authorization its spec documents",
		(_name, route) => {
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
			// Reads source, because "the rows this returned belong to the caller"
			// isn't visible in the handler map. Catches a route that forgot; the
			// Bruno suite is what demonstrates the rows are actually filtered.
			const source = readFileSync(route.file, "utf8");
			if (!source.includes('from "@workspace/lib/db/db"')) return;
			const scoped = source.includes('from "@/lib/api/scope"');
			const adminOnly = Object.values(route.handlers).some((h) => apiHandlerMeta(h)?.adminOnly === true);
			expect(scoped || adminOnly, "queries the database without scoping to the caller").toBe(true);
		},
	);

	it("documents exactly the operations it implements", () => {
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
