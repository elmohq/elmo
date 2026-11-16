import { describe, expect, it } from "vitest";
import { isWithin } from "./paths.js";

describe("isWithin", () => {
	it("treats a directory as inside itself, with or without a trailing slash", () => {
		expect(isWithin("/srv/elmo", "/srv/elmo")).toBe(true);
		expect(isWithin("/srv/elmo", "/srv/elmo/")).toBe(true);
		expect(isWithin("/srv/elmo/", "/srv/elmo")).toBe(true);
	});

	it("accepts anything below the directory, however deep", () => {
		expect(isWithin("/srv/elmo", "/srv/elmo/reports")).toBe(true);
		expect(isWithin("/srv/elmo", "/srv/elmo/reports/2026/audit.html")).toBe(true);
	});

	it("treats everything as inside the filesystem root", () => {
		expect(isWithin("/", "/srv")).toBe(true);
	});

	it("rejects parents and unrelated paths", () => {
		expect(isWithin("/srv/elmo", "/srv")).toBe(false);
		expect(isWithin("/srv/elmo", "/")).toBe(false);
		expect(isWithin("/srv/elmo", "/srv/other")).toBe(false);
	});

	it("rejects a sibling that shares the parent's name as a prefix", () => {
		expect(isWithin("/srv/elmo", "/srv/elmo-backup")).toBe(false);
		expect(isWithin("/srv/elmo", "/srv/elmo2/file")).toBe(false);
	});

	it("resolves dot-dot segments before deciding", () => {
		expect(isWithin("/srv/elmo", "/srv/elmo/reports/../config.json")).toBe(true);
		expect(isWithin("/srv/elmo", "/srv/elmo/../other")).toBe(false);
		expect(isWithin("/srv/elmo", "/srv/elmo/reports/../../etc/passwd")).toBe(false);
	});
});
