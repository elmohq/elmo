/**
 * E2E test for the env → DB config import path (plan §10, amendment A1).
 *
 * The worker's SCRAPE_TARGETS → `model_targets` import runs once at first boot
 * via `ensureInstanceConfig`. seed.ts pre-stamps `instance_meta` so the real
 * worker never re-imports (that is what keeps E2E off paid APIs), which means
 * this dedicated check is the one place the importer itself is exercised:
 * against the E2E Postgres, with an empty catalog and no `instance_meta`, we
 * invoke the real `ensureInstanceConfig` and assert it seeds exactly the stub
 * target, stamps `instance_meta`, and is a no-op on a second run.
 *
 * Run as its own step (not a Playwright spec) so it never races the parallel
 * fixture suites over the shared catalog. The import re-creates the stub row +
 * `instance_meta`, restoring the seeded end-state, so ordering vs seed.ts is
 * immaterial — both converge on {stub target, instance_meta stamped}.
 *
 * Usage: tsx config-import.ts
 */
import assert from "node:assert/strict";
import pg from "pg";
import { DATABASE_URL } from "./fixtures";

// ensureInstanceConfig reads these at import (the drizzle pool) and at call
// time, so set them before importing the worker's importer below.
process.env.DATABASE_URL = DATABASE_URL;
process.env.DEPLOYMENT_MODE ??= "local";
process.env.SCRAPE_TARGETS = "stub:stub";

interface EnsureInstanceConfigResult {
  imported: boolean;
  targetsImported: number;
}

async function loadImporter(): Promise<() => Promise<EnsureInstanceConfigResult>> {
  // @workspace/lib is CommonJS and e2e deliberately doesn't depend on it (to
  // keep its install light), so reach into the source directly. The non-literal
  // specifier keeps this cross-package module out of e2e's tsc program while tsx
  // still resolves it at runtime; the dynamic import also guarantees the env
  // above is set before the drizzle client is constructed.
  const specifier = "../packages/lib/src/config/import";
  const mod = (await import(specifier)) as {
    ensureInstanceConfig: () => Promise<EnsureInstanceConfigResult>;
  };
  return mod.ensureInstanceConfig;
}

async function main() {
  const ensureInstanceConfig = await loadImporter();
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Empty catalog + instance_meta absent → a true first-boot import.
    await client.query("DELETE FROM configs");
    await client.query("DELETE FROM model_targets");
    await client.query("DELETE FROM instance_meta");

    // First boot: imports SCRAPE_TARGETS=stub:stub into the catalog.
    const first = await ensureInstanceConfig();
    assert.equal(first.imported, true, "first invocation should import");
    assert.equal(first.targetsImported, 1, "should import exactly one target");

    const { rows: targets } = await client.query(
      `SELECT organization_id, model, provider, version, web_search, enabled FROM model_targets`,
    );
    assert.equal(targets.length, 1, "catalog should hold exactly the stub row");
    assert.deepEqual(
      targets[0],
      {
        organization_id: null,
        model: "stub",
        provider: "stub",
        version: null,
        web_search: false,
        enabled: true,
      },
      "the imported row should be the no-network stub target",
    );

    const { rows: meta } = await client.query(
      `SELECT env_imported_at FROM instance_meta WHERE id = 'instance'`,
    );
    assert.equal(meta.length, 1, "instance_meta should have the instance row");
    assert.ok(meta[0].env_imported_at, "instance_meta.env_imported_at should be stamped");

    // Second boot: short-circuits on instance_meta — no import, no duplicates.
    const second = await ensureInstanceConfig();
    assert.equal(second.imported, false, "second invocation must be a no-op");
    const { rows: afterSecond } = await client.query(`SELECT id FROM model_targets`);
    assert.equal(afterSecond.length, 1, "second invocation must not duplicate rows");

    console.log("config-import e2e: PASS — stub target imported, instance_meta stamped, re-run is a no-op");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("config-import e2e FAILED:", err);
  process.exit(1);
});
