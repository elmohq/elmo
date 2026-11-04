import { describe, expect, it } from "vitest";
import { authDocument } from "@/lib/auth-md";

describe("auth.md", () => {
	it("walks through the auth.md steps in order", () => {
		const headings = authDocument.match(/^## .+$/gm);

		expect(headings).toEqual([
			"## Step 1 — Discover",
			"## Step 2 — Pick a method",
			"## Step 3 — Register",
			"## Step 4 — Claim",
			"## Step 5 — Exchange",
			"## Step 6 — Use the access_token",
			"## Errors",
			"## Revocation",
		]);
	});

	it("points agents at the hosted deployment's discovery documents", () => {
		expect(authDocument).toContain("https://app.elmohq.com/.well-known/oauth-protected-resource");
		expect(authDocument).toContain("https://app.elmohq.com/.well-known/oauth-authorization-server");
	});
});
