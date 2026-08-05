import { describe, expect, it } from "vitest";
import { assertSupportedDockerComposeVersion } from "./compose-version.js";

describe("Docker Compose version gate", () => {
	it("accepts supported desktop and standalone versions", () => {
		expect(assertSupportedDockerComposeVersion("v2.24.0-desktop.1\n")).toBe("2.24.0");
		expect(assertSupportedDockerComposeVersion("Docker Compose version v2.39.1")).toBe("2.39.1");
	});

	it("fails before deployment mutation when required capabilities are absent", () => {
		expect(() => assertSupportedDockerComposeVersion("2.23.3")).toThrow(/2.24.0 or newer/);
		expect(() => assertSupportedDockerComposeVersion("unknown")).toThrow(/2.24.0 or newer/);
	});
});
