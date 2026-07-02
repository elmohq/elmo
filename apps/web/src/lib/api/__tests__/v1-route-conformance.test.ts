/**
 * Conformance test: every `/api/v1` route handler is authenticated.
 *
 * Context: `evaluateDeploymentPolicy` (see `@/lib/auth/policies`) no longer
 * authenticates `/api/v1/**` requests — that check was removed when API-key
 * auth moved from the `ADMIN_API_KEYS` env var to better-auth DB keys.
 * Authentication now happens entirely inside `createApiHandler` (see
 * `@/lib/api/handler`), which every v1 route's `handle` is wrapped in.
 *
 * That means nothing at the middleware layer stops an unauthenticated route
 * from shipping — the only thing standing between us and an open endpoint is
 * "did the route file remember to call `createApiHandler(`". This test turns
 * that into an enforced invariant: it statically scans every route file
 * under `src/routes/api/v1/` that defines `handlers:` and asserts the file's
 * source also contains `createApiHandler(`.
 *
 * If this test fails: a route under `src/routes/api/v1/` defines `handlers:`
 * without going through `createApiHandler`. Either wrap the handler(s) in
 * `createApiHandler({ ... })`, or — if the route is deliberately public
 * (like the `/docs` redirect) — add its path to `PUBLIC_V1_ROUTE_FILES`
 * below with a comment explaining why it's safe to leave unauthenticated.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Resolved relative to this file: src/lib/api/__tests__/ -> ../../../routes/api/v1
// i.e. src/lib/api/__tests__/../../../routes/api/v1 == src/routes/api/v1
const V1_ROUTES_DIR = fileURLToPath(new URL("../../../routes/api/v1", import.meta.url));

/**
 * Route files (relative to `V1_ROUTES_DIR`) that are intentionally public —
 * i.e. they do not, and should not, require API-key authentication.
 *
 * Keep this list short and each entry commented. Every entry is also
 * verified to exist on disk (below), so renaming or deleting a public route
 * can't silently leave a stale allowlist entry that widens the real public
 * surface without anyone noticing.
 */
const PUBLIC_V1_ROUTE_FILES = [
	// Redirects unauthenticated visitors to the hosted docs site. It has no
	// `handlers:` block at all (just a `beforeLoad` redirect), so it isn't
	// actually caught by the `handlers:` scan below — listed anyway so the
	// allowlist mechanism has a real example and doesn't silently rot.
	"docs/index.tsx",
];

/** Recursively collect *.ts/*.tsx files under `dir`. */
function collectSourceFiles(dir: string): string[] {
	const entries = readdirSync(dir);
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			files.push(...collectSourceFiles(fullPath));
		} else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
			files.push(fullPath);
		}
	}
	return files;
}

describe("v1 route conformance", () => {
	const sourceFiles = collectSourceFiles(V1_ROUTES_DIR);
	const filesWithHandlers = sourceFiles.filter((path) => readFileSync(path, "utf-8").includes("handlers:"));

	// Guards against a broken glob/path silently making this whole test file
	// vacuously true (e.g. if V1_ROUTES_DIR resolved to an empty directory).
	it("found a plausible number of handler-defining route files", () => {
		expect(filesWithHandlers.length).toBeGreaterThanOrEqual(5);
	});

	for (const relativePath of PUBLIC_V1_ROUTE_FILES) {
		it(`allowlisted public route "${relativePath}" exists on disk`, () => {
			// Fails loudly (rather than silently) if the file was renamed or
			// deleted — a stale entry here must not be able to widen the
			// public surface just because nobody noticed it went stale.
			let exists = true;
			try {
				statSync(join(V1_ROUTES_DIR, relativePath));
			} catch {
				exists = false;
			}
			expect(exists).toBe(true);
		});
	}

	for (const path of sourceFiles) {
		const relativePath = relative(V1_ROUTES_DIR, path);

		if (!filesWithHandlers.includes(path)) {
			continue;
		}

		if (PUBLIC_V1_ROUTE_FILES.includes(relativePath)) {
			continue;
		}

		it(`${relativePath} calls createApiHandler(`, () => {
			expect(readFileSync(path, "utf-8")).toContain("createApiHandler(");
		});
	}
});
