#!/usr/bin/env node
/**
 * Fails when a Nitro server bundle still expects to resolve a package from disk
 * at request time.
 *
 * The bundlers turn an unresolved CommonJS `require("x")` into a `__require("x")`
 * that only runs when that module is first needed. Nothing complains at build
 * time, the output looks complete, and the app dies on the first render in any
 * environment that ships `.output` without a `node_modules` beside it — the
 * Docker image and the Vercel function both do. Worse, whether it fires depends
 * on which chunk the module lands in: the same unresolved require can sit
 * harmlessly in a route nobody hits and then start taking down every page after
 * an unrelated dependency change.
 *
 * Usage: node scripts/check-server-bundle.mjs <path-to-.output/server> [...]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** Rolldown emits this for a `require()` it could not link at build time. */
const RUNTIME_REQUIRE = /__require\("([^"]+)"\)/g;

function serverFiles(dir) {
	const found = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		// Traced dependencies really are resolved from disk; they are the
		// supported escape hatch (see `traceDeps` in the app vite configs).
		if (entry.isDirectory()) {
			if (entry.name !== "node_modules") found.push(...serverFiles(path));
		} else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) {
			found.push(path);
		}
	}
	return found;
}

function tracedPackages(serverDir) {
	const dir = join(serverDir, "node_modules");
	try {
		if (!statSync(dir).isDirectory()) return new Set();
	} catch {
		return new Set();
	}
	const names = new Set();
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith("@")) {
			for (const scoped of readdirSync(join(dir, entry.name))) {
				names.add(`${entry.name}/${scoped}`);
			}
		} else {
			names.add(entry.name);
		}
	}
	return names;
}

function unresolved(serverDir) {
	const traced = tracedPackages(serverDir);
	const problems = [];
	for (const file of serverFiles(serverDir)) {
		const source = readFileSync(file, "utf8");
		for (const [, specifier] of source.matchAll(RUNTIME_REQUIRE)) {
			if (BUILTINS.has(specifier)) continue;
			const pkg = specifier.startsWith("@")
				? specifier.split("/").slice(0, 2).join("/")
				: specifier.split("/")[0];
			if (traced.has(pkg)) continue;
			problems.push({ file: relative(serverDir, file), specifier });
		}
	}
	return problems;
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
	console.error("usage: check-server-bundle.mjs <path-to-.output/server> [...]");
	process.exit(2);
}

let failed = false;
for (const dir of dirs) {
	const problems = unresolved(dir);
	if (problems.length === 0) continue;
	failed = true;
	console.error(`${dir}: server bundle expects packages it does not ship`);
	for (const { file, specifier } of problems) {
		console.error(`  ${file}: require("${specifier}")`);
	}
	const packages = [...new Set(problems.map((p) => p.specifier))].join(", ");
	console.error(
		`  Declare the dependency that pulls in ${packages} in this app's package.json so the` +
			" bundler resolves it, or add it to the nitro plugin's traceDeps so it ships alongside.",
	);
}

process.exit(failed ? 1 : 0);
