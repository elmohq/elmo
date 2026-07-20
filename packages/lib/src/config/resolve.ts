/**
 * The `@workspace/lib/config/resolve` surface (§5). Implementation is split:
 * resolve-core.ts is the pure merge/clamp/effective-targets logic; resolve-db.ts
 * is the thin drizzle layer that feeds it (and re-exports the core). Import from
 * here — the split is an internal detail.
 */
export * from "./resolve-db";
