import { describe, expect, it } from "vitest";
import { workspaceTitle } from "@/lib/workspaces/naming";

describe("workspaceTitle", () => {
	it("says what the thing is, since a company name alone doesn't", () => {
		expect(workspaceTitle("Nike")).toBe("Nike Workspace");
		expect(workspaceTitle("Acme Corp")).toBe("Acme Corp Workspace");
	});

	it("doesn't say it twice, however the customer capitalized it", () => {
		expect(workspaceTitle("Acme Workspace")).toBe("Acme Workspace");
		expect(workspaceTitle("Acme workspace")).toBe("Acme workspace");
		expect(workspaceTitle("Acme WORKSPACE")).toBe("Acme WORKSPACE");
	});

	it("ignores trailing space when deciding", () => {
		expect(workspaceTitle("Acme Workspace ")).toBe("Acme Workspace");
		expect(workspaceTitle(" Nike ")).toBe("Nike Workspace");
	});
});
