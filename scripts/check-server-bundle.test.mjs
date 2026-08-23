import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("check-server-bundle.mjs", import.meta.url));

/** Build a throwaway app directory and run the check over it. */
function check(files, { traced = [], tracedIn = ".output/server" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "check-server-bundle-"));
  for (const [name, source] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, source);
  }
  for (const pkg of traced) {
    mkdirSync(join(dir, tracedIn, "node_modules", pkg), { recursive: true });
  }
  const { status, stderr } = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
  return { status, stderr };
}

test("passes a bundle that resolves everything at build time", () => {
  const { status } = check({
    ".output/server/index.mjs": 'import { x } from "./chunk.mjs";\nexport { x };\n',
    ".output/server/chunk.mjs": "export const x = 1;\n",
  });
  assert.equal(status, 0);
});

test("passes requires of node builtins", () => {
  const { status } = check({
    ".output/server/index.mjs": 'var fs = __require("node:fs");\nvar path = __require("path");\n',
  });
  assert.equal(status, 0);
});

test("fails a require of a package the bundle does not ship", () => {
  const { status, stderr } = check({
    ".output/server/_ssr/footer.mjs": 'var React = __require("react");\n',
  });
  assert.equal(status, 1);
  assert.match(stderr, /_ssr\/footer\.mjs/);
  assert.match(stderr, /require\("react"\)/);
});

test("passes a require of a traced dependency, which does ship", () => {
  const { status } = check(
    {
      ".output/server/index.mjs":
        'var resvg = __require("@resvg/resvg-js");\nvar pg = __require("pg/lib/native");\n',
    },
    { traced: ["@resvg/resvg-js", "pg"] },
  );
  assert.equal(status, 0);
});

test("ignores the traced dependencies' own sources", () => {
  const { status } = check(
    { ".output/server/node_modules/pg/index.js": 'var react = __require("react");\n' },
    { traced: ["pg"] },
  );
  assert.equal(status, 0);
});

// The Vercel preset writes function directories and no .output at all, which is
// the layout that actually shipped the broken bundle.
test("checks the vercel preset's function directories", () => {
  const { status, stderr } = check({
    ".vercel/output/functions/__server.func/_ssr/footer.mjs": 'var React = __require("react");\n',
  });
  assert.equal(status, 1);
  assert.match(stderr, /__server\.func/);
  assert.match(stderr, /require\("react"\)/);
});

test("passes a clean vercel preset build", () => {
  const { status } = check(
    {
      ".vercel/output/functions/__server.func/index.mjs":
        'var fs = __require("node:fs");\nvar resvg = __require("@resvg/resvg-js");\n',
    },
    { traced: ["@resvg/resvg-js"], tracedIn: ".vercel/output/functions/__server.func" },
  );
  assert.equal(status, 0);
});

test("fails when there is no server bundle to check at all", () => {
  const { status, stderr } = check({ "package.json": "{}\n" });
  assert.equal(status, 1);
  assert.match(stderr, /no server bundle found/);
});
