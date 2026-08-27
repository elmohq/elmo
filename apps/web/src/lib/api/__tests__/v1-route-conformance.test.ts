/**
 * Every route under `routes/api/v1` must be built with `createApiHandler`.
 *
 * The deployment middleware can only check that a bearer is present — resolving
 * one needs a database lookup, and that middleware is pure and synchronous — so
 * the factory is where a caller is actually identified and their scopes
 * checked. Nothing else enforces that a route uses it, which makes this test
 * the only thing standing between a newly added file and an endpoint that
 * answers to anyone.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import spec from "@workspace/api-spec";
import { describe, expect, it } from "vitest";

const V1_ROOT = join(import.meta.dirname, "../../../routes/api/v1");

function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return routeFiles(full);
		return entry.endsWith(".ts") ? [full] : [];
	});
}

/**
 * A declared verb, and whatever it was assigned. Either a `createApiHandler({`
 * call inline, or an identifier — which a route uses when one handler serves
 * several verbs. An inline `async () => …` would match neither, which is the
 * shape this is looking for.
 */
const HTTP_METHOD = /^\s*(GET|POST|PUT|PATCH|DELETE):\s*(\S+)/gm;

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const DECLARED_METHOD = /^\s*(GET|POST|PUT|PATCH|DELETE): createApiHandler/gm;

function documentedOperations(): string[] {
	const operations: string[] = [];
	for (const [path, methods] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
		for (const method of Object.keys(methods)) {
			if (HTTP_METHODS.has(method.toUpperCase())) operations.push(`${method.toUpperCase()} ${path}`);
		}
	}
	return operations;
}

/** The route file's path on disk is the URL it answers for; `$id` is `{id}`. */
function pathForRoute(file: string): string | null {
	const route = file.slice(V1_ROOT.length + 1).replace(/\.ts$/, "");
	// The catch-all answers for paths nothing claimed; it has no operation.
	if (route === "$") return null;
	const trimmed = route.replace(/\/index$/, "").replace(/^index$/, "");
	return trimmed === "" ? "" : `/${trimmed}`.replace(/\$(\w+)/g, "{$1}");
}

function implementedOperations(files: string[]): string[] {
	const operations: string[] = [];
	for (const file of files) {
		const path = pathForRoute(file);
		if (path === null) continue;
		for (const [, method] of readFileSync(file, "utf8").matchAll(DECLARED_METHOD)) {
			operations.push(`${method} ${path}`);
		}
	}
	return operations;
}

describe("/api/v1 route conformance", () => {
	const files = routeFiles(V1_ROOT);

	it("finds the routes at all", () => {
		// Guards against the whole suite silently passing because the directory
		// moved and every check below iterated an empty list.
		expect(files.length).toBeGreaterThan(10);
	});

	it.each(files.map((file) => [file.slice(V1_ROOT.length + 1), file]))(
		"%s authenticates through createApiHandler",
		(_name, file) => {
			const source = readFileSync(file, "utf8");
			expect(source, "route declares no handlers built with createApiHandler").toContain("createApiHandler(");

			// Every declared verb has to be one of them. A verb wired to a bare
			// function would answer without ever resolving a caller.
			for (const [, method, assigned] of source.matchAll(HTTP_METHOD)) {
				const viaFactory = assigned.startsWith("createApiHandler(");
				const viaBinding = /^[A-Za-z_$][\w$]*,?$/.test(assigned);
				expect(viaFactory || viaBinding, `${method} is not built with createApiHandler`).toBe(true);
			}
		},
	);

	it.each(files.map((file) => [file.slice(V1_ROOT.length + 1), file]))(
		"%s scopes whatever it reads to the caller",
		(_name, file) => {
			const source = readFileSync(file, "utf8");
			// A route that queries directly has to decide what the caller may see.
			// The helpers in lib/api/scope are the only place that decision is
			// made, so a route reaching for the database without them is either a
			// tenancy hole or an admin-only endpoint that says so.
			if (!source.includes('from "@workspace/lib/db/db"')) return;
			const scoped = source.includes('from "@/lib/api/scope"');
			const adminOnly = source.includes("adminOnly: true");
			expect(scoped || adminOnly, "queries the database without scoping to the caller").toBe(true);
		},
	);

	it("documents exactly the operations it implements", () => {
		// An endpoint missing from the spec is a surface nobody reviews and no
		// client knows to use; one in the spec that doesn't exist is a 404 with
		// documentation. Neither shows up in a route's own tests.
		expect(documentedOperations().sort()).toEqual(implementedOperations(files).sort());
	});

	it.each(files.map((file) => [file.slice(V1_ROOT.length + 1), file]))(
		"%s rejects the verbs it does not implement",
		(_name, file) => {
			const source = readFileSync(file, "utf8");
			// Without the guard, an unclaimed verb falls through the file router to
			// the SPA and answers 200 with HTML.
			expect(source).toContain("withMethodGuard(");
		},
	);
});
