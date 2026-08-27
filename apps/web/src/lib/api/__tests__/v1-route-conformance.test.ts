/**
 * Every route under `routes/api/v1` must be built with `createApiHandler`.
 *
 * This matters more than it looks. The deployment middleware used to reject any
 * bearer token that wasn't an instance admin key before a route ever ran, so a
 * new file was authenticated whether or not its author thought about it. An
 * organization key can't be resolved there — it needs a database lookup, and
 * that middleware is pure and synchronous — so the gate moved into the handler
 * factory. This test is what replaced the middleware's blanket coverage: it
 * fails the moment a route is added that doesn't go through the gate.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const V1_ROOT = join(import.meta.dirname, "../../../routes/api/v1");

function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return routeFiles(full);
		return entry.endsWith(".ts") ? [full] : [];
	});
}

const HTTP_METHOD = /^\s*(GET|POST|PUT|PATCH|DELETE):/gm;

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
			const handlerCount = source.match(/createApiHandler\(/g)?.length ?? 0;
			const methodCount = source.match(HTTP_METHOD)?.length ?? 0;

			expect(handlerCount, "route declares no handlers built with createApiHandler").toBeGreaterThan(0);
			// Every declared verb has to be one of them. A method wired to a bare
			// function would answer without ever resolving a caller.
			expect(methodCount, "a declared HTTP method is not built with createApiHandler").toBeLessThanOrEqual(
				handlerCount,
			);
		},
	);

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
