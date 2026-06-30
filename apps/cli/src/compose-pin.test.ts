import { describe, expect, it } from "vitest";
import { parseRenderedVersion, refreshHeaderVersion, repinImages } from "./compose-pin.js";

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

describe("repinImages", () => {
	it("re-pins every elmohq/elmo-* image to the target version", () => {
		const out = repinImages(LEGACY_COMPOSE, "0.2.13");
		expect(out).toContain("elmohq/elmo-web:0.2.13");
		expect(out).toContain("elmohq/elmo-worker:0.2.13");
		expect(out).toContain("elmohq/elmo-db-migrate:0.2.13");
		expect(out).not.toContain(":latest");
	});

	it("leaves third-party images untouched", () => {
		const out = repinImages(LEGACY_COMPOSE, "0.2.13");
		expect(out).toContain("postgres:16-alpine");
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
		const out = refreshHeaderVersion(repinImages(LEGACY_COMPOSE, "0.2.13"), "0.2.13");
		expect(out).not.toContain(":latest");
		expect(out).toContain("elmohq/elmo-web:0.2.13");
		expect(out).toContain("postgres:16-alpine");
		expect(parseRenderedVersion(out)).toBe("0.2.13");
	});
});
