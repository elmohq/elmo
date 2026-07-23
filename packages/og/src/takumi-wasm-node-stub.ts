/**
 * Build-time replacement for `@takumi-rs/wasm/node`, aliased in from
 * `apps/web/vite.config.ts`.
 *
 * The OG route renders with takumi's native `@takumi-rs/core` backend, selected
 * via the `node` export condition with `!unwasm` so no WASM asset is emitted.
 * takumi-js's `node` backend still statically references `@takumi-rs/wasm/node`
 * for its (unused) webcontainer path, and that module eagerly
 * `readFileSync`s `takumi_wasm_bg.wasm` at import time. Nitro merges the tiny
 * webcontainer chunk into its importer, so the read runs at startup — and with
 * the asset absent it throws ENOENT and 500s every request.
 *
 * We never run in a webcontainer, so the WASM backend is dead weight. This stub
 * provides the shape takumi-js imports without the eager file read; if the WASM
 * path were ever taken it would surface a clear error instead of a native crash.
 */
const wasmBackendDisabled = (): never => {
	throw new Error("takumi WASM backend is disabled in this build; the native @takumi-rs/core backend renders images.");
};

export class Renderer {}

export function initSync(): never {
	return wasmBackendDisabled();
}

export default function init(): never {
	return wasmBackendDisabled();
}
