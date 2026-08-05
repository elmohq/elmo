import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("runtime generation migration contract", () => {
	it("keeps the schema, migration, and Drizzle snapshot aligned", async () => {
		const [schema, migration, snapshot] = await Promise.all([
			readFile(new URL("./db/schema.ts", import.meta.url), "utf8"),
			readFile(new URL("./db/migrations/0020_lease_cloud_brand_analysis.sql", import.meta.url), "utf8"),
			readFile(new URL("./db/migrations/meta/0020_snapshot.json", import.meta.url), "utf8"),
		]);
		for (const source of [schema, migration, snapshot]) {
			expect(source).toContain("elmo_runtime_generation");
			expect(source).toContain("generation");
		}
		expect(migration).toContain("VALUES (true, '0020')");
	});
});
