import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("sdk-fingerprint.mjs", import.meta.url));

function write(root, file, content) {
  mkdirSync(join(root, file, ".."), { recursive: true });
  writeFileSync(join(root, file), content);
}

/** A repo as `pnpm generate:sdk` leaves it. */
function generatedRepo() {
  const root = mkdtempSync(join(tmpdir(), "sdk-fingerprint-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  write(root, "packages/api-spec/src/openapi.json", '{ "openapi": "3.1.0" }');
  write(root, "hey-api.config.json", "{}");
  write(root, "scripts/generate-sdks.mjs", 'const HEY_API = "hey-api@1.0.0";');
  write(root, "packages/sdk-typescript/package.json", '{\n  "name": "@elmohq/sdk",\n  "version": "0.4.4"\n}\n');
  write(root, "packages/sdk-typescript/src/index.ts", "export const a = 1;\n");
  write(root, "packages/sdk-typescript/.gitignore", "dist/\n");
  write(root, "packages/sdk-python/pyproject.toml", '[project]\nversion = "0.4.4"\n');
  write(root, ".hey-api/generate-lock.json", "{}");
  execFileSync(process.execPath, [SCRIPT, "--write", root]);
  return root;
}

function check(root) {
  try {
    execFileSync(process.execPath, [SCRIPT, "--check", root], { stdio: "pipe" });
    return "";
  } catch (error) {
    return error.stderr.toString();
  }
}

test("freshly generated SDKs pass", () => {
  assert.equal(check(generatedRepo()), "");
});

test("an API change that wasn't regenerated fails", () => {
  const root = generatedRepo();
  write(root, "packages/api-spec/src/openapi.json", '{ "openapi": "3.1.0", "paths": {} }');
  assert.match(check(root), /need regenerating/);
});

test("moving the generator pin without regenerating fails", () => {
  const root = generatedRepo();
  write(root, "scripts/generate-sdks.mjs", 'const HEY_API = "hey-api@1.1.0";');
  assert.match(check(root), /need regenerating/);
});

test("a hand edit to the SDK fails", () => {
  const root = generatedRepo();
  write(root, "packages/sdk-typescript/src/index.ts", "export const a = 2;\n");
  assert.match(check(root), /don't edit them by hand/);
});

test("a file added to the SDK by hand fails", () => {
  const root = generatedRepo();
  write(root, "packages/sdk-python/src/extra.py", "x = 1\n");
  assert.match(check(root), /don't edit them by hand/);
});

test("a release version bump passes without regenerating", () => {
  const root = generatedRepo();
  write(root, "packages/sdk-typescript/package.json", '{\n  "name": "@elmohq/sdk",\n  "version": "0.5.0"\n}\n');
  write(root, "packages/sdk-python/pyproject.toml", '[project]\nversion = "0.5.0"\n');
  assert.equal(check(root), "");
});

test("build output the SDK ignores passes", () => {
  const root = generatedRepo();
  write(root, "packages/sdk-typescript/dist/index.mjs", "export const a = 1;\n");
  assert.equal(check(root), "");
});
