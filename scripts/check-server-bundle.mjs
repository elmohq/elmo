#!/usr/bin/env node
/**
 * Fails when a server bundle still expects to resolve a package from disk at
 * request time.
 *
 * The bundlers turn an unresolved CommonJS `require("x")` into a `__require("x")`
 * that only runs when that module is first needed. Nothing complains at build
 * time, the output looks complete, and the app dies on the first render in any
 * environment that ships the bundle without a `node_modules` beside it — the
 * Docker image and the Vercel function both do. Worse, whether it fires depends
 * on which chunk the module lands in: the same unresolved require can sit
 * harmlessly in a route nobody hits and then start taking down every page after
 * an unrelated dependency change.
 *
 * Usage: node scripts/check-server-bundle.mjs <app-dir> [...]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** Rolldown emits this for a `require()` it could not link at build time. */
const RUNTIME_REQUIRE = /__require\("([^"]+)"\)/g;

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Where the server bundle lands depends on the Nitro preset: the node preset
 * writes `.output/server`, the Vercel preset writes a function directory per
 * entrypoint and no `.output` at all.
 */
function serverBundles(appDir) {
  const bundles = [];

  const node = join(appDir, ".output", "server");
  if (isDirectory(node)) bundles.push(node);

  const functions = join(appDir, ".vercel", "output", "functions");
  if (isDirectory(functions)) {
    for (const name of readdirSync(functions)) {
      const dir = join(functions, name);
      if (name.endsWith(".func") && isDirectory(dir)) bundles.push(dir);
    }
  }
  return bundles;
}

function bundleFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // Traced dependencies really are resolved from disk; they are the
    // supported escape hatch (see `traceDeps` in the app vite configs).
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") found.push(...bundleFiles(path));
    } else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) {
      found.push(path);
    }
  }
  return found;
}

function tracedPackages(bundleDir) {
  const dir = join(bundleDir, "node_modules");
  if (!isDirectory(dir)) return new Set();
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

function unresolved(bundleDir) {
  const traced = tracedPackages(bundleDir);
  const problems = [];
  for (const file of bundleFiles(bundleDir)) {
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(RUNTIME_REQUIRE)) {
      if (BUILTINS.has(specifier)) continue;
      const pkg = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (traced.has(pkg)) continue;
      problems.push({ file: relative(bundleDir, file), specifier });
    }
  }
  return problems;
}

const appDirs = process.argv.slice(2);
if (appDirs.length === 0) {
  console.error("usage: check-server-bundle.mjs <app-dir> [...]");
  process.exit(2);
}

let failed = false;
for (const appDir of appDirs) {
  const bundles = serverBundles(appDir);
  if (bundles.length === 0) {
    console.error(`${appDir}: no server bundle found — expected .output/server or .vercel/output/functions`);
    failed = true;
    continue;
  }
  for (const bundle of bundles) {
    const problems = unresolved(bundle);
    if (problems.length === 0) continue;
    failed = true;
    console.error(`${bundle}: server bundle expects packages it does not ship`);
    for (const { file, specifier } of problems) {
      console.error(`  ${file}: require("${specifier}")`);
    }
    const packages = [...new Set(problems.map((p) => p.specifier))].join(", ");
    console.error(
      `  Declare the dependency that pulls in ${packages} in this app's package.json so the` +
        " bundler resolves it, or add it to the nitro plugin's traceDeps so it ships alongside.",
    );
  }
}

process.exit(failed ? 1 : 0);
