import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("sync-sdk-versions.mjs", import.meta.url));
const PYPROJECT = "packages/sdk-python/pyproject.toml";

function repo({ spec, py }) {
  const root = mkdtempSync(join(tmpdir(), "sync-sdk-versions-"));
  for (const [file, content] of [
    ["packages/api-spec/package.json", spec],
    [PYPROJECT, py],
  ]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

function sync(root) {
  execFileSync(process.execPath, [SCRIPT, root], { stdio: "pipe" });
}

test("the Python SDK takes the API spec's release version", () => {
  const root = repo({
    spec: '{ "name": "@workspace/api-spec", "version": "0.5.0" }',
    py: '[build-system]\nrequires = ["hatchling>=1.27"]\n\n[project]\nname = "elmohq-sdk"\nversion = "0.4.4"\ndependencies = ["httpx>=0.21.2"]\n',
  });
  sync(root);
  assert.equal(
    readFileSync(join(root, PYPROJECT), "utf8"),
    '[build-system]\nrequires = ["hatchling>=1.27"]\n\n[project]\nname = "elmohq-sdk"\nversion = "0.5.0"\ndependencies = ["httpx>=0.21.2"]\n',
  );
});

test("a pyproject without a version fails instead of shipping unversioned", () => {
  const root = repo({
    spec: '{ "version": "0.5.0" }',
    py: '[project]\nname = "elmohq-sdk"\n',
  });
  assert.throws(() => sync(root));
});
