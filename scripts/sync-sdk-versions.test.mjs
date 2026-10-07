import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("sync-sdk-versions.mjs", import.meta.url));

function repo({ spec, ts, py }) {
  const root = mkdtempSync(join(tmpdir(), "sync-sdk-versions-"));
  for (const [file, content] of [
    ["packages/api-spec/package.json", spec],
    ["packages/sdk-typescript/package.json", ts],
    ["packages/sdk-python/pyproject.toml", py],
  ]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

function sync(root) {
  execFileSync(process.execPath, [SCRIPT, root], { stdio: "pipe" });
}

const read = (root, file) => readFileSync(join(root, file), "utf8");

test("both SDKs take the API spec's release version", () => {
  const root = repo({
    spec: '{ "name": "@workspace/api-spec", "version": "0.5.0" }',
    ts: '{\n  "name": "@elmohq/sdk",\n  "version": "0.1.0",\n  "dependencies": { "x": "0.1.0" }\n}\n',
    py: '[project]\nname = "elmohq-sdk"\nversion = "0.1.0"\nrequires-python = ">=3.10"\n',
  });
  sync(root);
  assert.equal(
    read(root, "packages/sdk-typescript/package.json"),
    '{\n  "name": "@elmohq/sdk",\n  "version": "0.5.0",\n  "dependencies": { "x": "0.1.0" }\n}\n',
  );
  assert.equal(
    read(root, "packages/sdk-python/pyproject.toml"),
    '[project]\nname = "elmohq-sdk"\nversion = "0.5.0"\nrequires-python = ">=3.10"\n',
  );
});

test("an SDK without a version fails instead of shipping unversioned", () => {
  const root = repo({
    spec: '{ "version": "0.5.0" }',
    ts: '{ "name": "@elmohq/sdk" }',
    py: 'version = "0.1.0"\n',
  });
  assert.throws(() => sync(root));
});
