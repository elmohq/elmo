import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("check-server-bundle.mjs", import.meta.url));

/** Build a throwaway `.output/server` tree and run the check over it. */
function check(files, { traced = [] } = {}) {
	const dir = mkdtempSync(join(tmpdir(), "check-server-bundle-"));
	for (const [name, source] of Object.entries(files)) {
		const path = join(dir, name);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, source);
	}
	for (const pkg of traced) {
		mkdirSync(join(dir, "node_modules", pkg), { recursive: true });
	}
	const { status, stderr } = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
	return { status, stderr };
}

test("passes a bundle that resolves everything at build time", () => {
	const { status } = check({
		"index.mjs": 'import { x } from "./chunk.mjs";\nexport { x };\n',
		"chunk.mjs": 'export const x = 1;\n',
	});
	assert.equal(status, 0);
});

test("passes requires of node builtins", () => {
	const { status } = check({
		"index.mjs": 'var fs = __require("node:fs");\nvar path = __require("path");\n',
	});
	assert.equal(status, 0);
});

test("fails a require of a package the bundle does not ship", () => {
	const { status, stderr } = check({
		"_ssr/footer.mjs": 'var React = __require("react");\n',
	});
	assert.equal(status, 1);
	assert.match(stderr, /_ssr\/footer\.mjs/);
	assert.match(stderr, /require\("react"\)/);
});

test("passes a require of a traced dependency, which does ship", () => {
	const { status } = check(
		{ "index.mjs": 'var resvg = __require("@resvg/resvg-js");\nvar pg = __require("pg/lib/native");\n' },
		{ traced: ["@resvg/resvg-js", "pg"] },
	);
	assert.equal(status, 0);
});

test("ignores the traced dependencies' own sources", () => {
	const { status } = check(
		{ "node_modules/pg/index.js": 'var react = __require("react");\n' },
		{ traced: ["pg"] },
	);
	assert.equal(status, 0);
});
