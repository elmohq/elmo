import { describe, expect, it } from "vitest";
import { parseRenderedVersion, planImageRelease, refreshHeaderVersion } from "./compose-pin.js";

const LEGACY_COMPOSE = `name: elmo

services:
  web:
    image: elmohq/elmo-web:latest
  worker:
    image: elmohq/elmo-worker:latest
  db-migrate:
    image: elmohq/elmo-db-migrate:latest
  postgres:
    image: postgres:16-alpine
`;

const HEADED_COMPOSE = `# Rendered by elmo 0.2.10 on 2026-01-01T00:00:00.000Z
# Run \`elmo upgrade\` after upgrading the CLI to refresh this file.
name: elmo

services:
  web:
    image: elmohq/elmo-web:0.2.10
  postgres:
    image: postgres:16-alpine
`;

describe("parseRenderedVersion", () => {
	it("reads the version from a rendered-by header", () => {
		expect(parseRenderedVersion(HEADED_COMPOSE)).toBe("0.2.10");
	});

	it("returns null when there is no header", () => {
		expect(parseRenderedVersion(LEGACY_COMPOSE)).toBeNull();
	});
});

describe("planImageRelease", () => {
	it("structurally re-pins every core image to the target version", () => {
		const out = planImageRelease(LEGACY_COMPOSE, "0.2.13").composeContents;
		expect(out).toContain("elmohq/elmo-web:0.2.13");
		expect(out).toContain("elmohq/elmo-worker:0.2.13");
		expect(out).toContain("elmohq/elmo-db-migrate:0.2.13");
		expect(out.match(/stop_grace_period: 65m/g)).toHaveLength(2);
		expect(out).not.toContain(":latest");
	});

	it("leaves third-party images untouched", () => {
		const out = planImageRelease(LEGACY_COMPOSE, "0.2.13").composeContents;
		expect(out).toContain("postgres:16-alpine");
	});

	it("replaces digest and implicit-latest pins", () => {
		const compose = `services:
  web:
    image: elmohq/elmo-web
  worker:
    image: elmohq/elmo-worker@sha256:abc123
`;
		const plan = planImageRelease(compose, "0.2.13");
		expect(plan.composeContents).toContain("image: elmohq/elmo-web:0.2.13");
		expect(plan.composeContents).toContain("image: elmohq/elmo-worker:0.2.13");
		expect(plan.images.dbMigrate).toBe("elmohq/elmo-db-migrate:0.2.13");
	});

	it("resolves aliases and preserves an explicit custom release pipeline", () => {
		const compose = `x-web-image: &web-image registry.example/elmo-web:old
services:
  web:
    image: *web-image
  worker:
    image: registry.example/elmo-worker:old
  db-migrate:
    image: registry.example/elmo-migrate:old
`;
		const plan = planImageRelease(compose, "0.2.13");
		expect(plan.composeContents).toContain("image: registry.example/elmo-web:0.2.13");
		expect(plan.images).toEqual({
			dbMigrate: "registry.example/elmo-migrate:0.2.13",
			web: "registry.example/elmo-web:0.2.13",
			worker: "registry.example/elmo-worker:0.2.13",
		});
	});

	it("rejects custom applications without an explicit matching migrator", () => {
		expect(() =>
			planImageRelease(
				"services:\n  web:\n    image: private/web:old\n  worker:\n    image: private/worker:old\n",
				"0.2.13",
			),
		).toThrow(/must define an explicit db-migrate image/);
	});
});

describe("refreshHeaderVersion", () => {
	it("replaces an existing header in place without duplicating it", () => {
		const out = refreshHeaderVersion(HEADED_COMPOSE, "0.2.13");
		expect(parseRenderedVersion(out)).toBe("0.2.13");
		expect(out.match(/# Rendered by elmo /g)).toHaveLength(1);
	});

	it("adds a header to a legacy file that has none", () => {
		expect(parseRenderedVersion(LEGACY_COMPOSE)).toBeNull();
		const out = refreshHeaderVersion(LEGACY_COMPOSE, "0.2.13");
		expect(parseRenderedVersion(out)).toBe("0.2.13");
		// Original content is preserved below the new header.
		expect(out).toContain("name: elmo");
	});
});

// Regression: a legacy install (no header, :latest tags) must come out fully
// re-pinned AND with a detectable version header, so `elmo upgrade` doesn't
// treat it as "already current" and skip the re-pin on the next run.
describe("legacy install re-pin round-trip", () => {
	it("pins images and records the version", () => {
		const out = refreshHeaderVersion(planImageRelease(LEGACY_COMPOSE, "0.2.13").composeContents, "0.2.13");
		expect(out).not.toContain(":latest");
		expect(out).toContain("elmohq/elmo-web:0.2.13");
		expect(out).toContain("postgres:16-alpine");
		expect(parseRenderedVersion(out)).toBe("0.2.13");
	});
});
