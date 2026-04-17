// Stub for @takumi-rs/core used by Vite/Nitro aliases.
// The OG routes always supply a WASM module via the `module:` option, so takumi-js
// never takes the native-core code path at runtime. Aliasing to this stub prevents
// @takumi-rs/core's loader from evaluating at module load and attempting to require
// a `.node` binding that isn't present in the Nitro production bundle.
export {};
