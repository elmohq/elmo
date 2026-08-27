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

/**
 * A declared verb, and whatever it was assigned. Either a `createApiHandler({`
 * call inline, or an identifier — which a route uses when one handler serves
 * several verbs. An inline `async () => …` would match neither, which is the
 * shape this is looking for.
 */
const HTTP_METHOD = /^\s*(GET|POST|PUT|PATCH|DELETE):\s*(\S+)/gm;

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
		"%s rejects the verbs it does not implement",
		(_name, file) => {
			const source = readFileSync(file, "utf8");
			// Without the guard, an unclaimed verb falls through the file router to
			// the SPA and answers 200 with HTML.
			expect(source).toContain("withMethodGuard(");
		},
	);
});
