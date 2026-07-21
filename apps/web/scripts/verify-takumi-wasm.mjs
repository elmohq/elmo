import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outputPaths = [
	".vercel/output/functions/__server.func/_libs/@takumi-rs/wasm.mjs",
	".output/server/_libs/@takumi-rs/wasm.mjs",
].map((path) => resolve(path));

const wasmModulePath = outputPaths.find(existsSync);

if (!wasmModulePath) {
	throw new Error(`Takumi WASM output was not found. Checked: ${outputPaths.join(", ")}`);
}

try {
	await import(pathToFileURL(wasmModulePath).href);
} catch (cause) {
	throw new Error(
		`Takumi WASM failed to initialize from ${wasmModulePath}. Refusing to deploy a broken Open Graph image endpoint.`,
		{ cause },
	);
}

console.log(`✓ Takumi WASM initialized: ${wasmModulePath}`);
