/**
 * The write partition is pinned by name, so adding a tool that mutates anything
 * breaks this file — which is the moment to ask whether an agent should do it.
 */
import { resetDeploymentCache } from "@workspace/deployment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import type { AdminAuth, OrganizationAuth, UserAuth } from "@/lib/auth/api-auth";
import { MCP_TOOLS, TOOL_SCOPES, toolsFor } from "../tools";

const WRITE_TOOLS = ["create_prompts", "update_prompt"];
const UNSCOPED_TOOLS = ["whoami", "list_models"];

const adminKey: AdminAuth = { kind: "admin", scopes: null, organizationId: null };

function orgKey(scopes: ApiScope[]): OrganizationAuth {
	return {
		kind: "organization",
		keyId: "key_1",
		name: "test key",
		organizationId: "org_1",
		organizationName: "Test Org",
		scopes: new Set(scopes),
		brandIds: null,
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit: 1000, window: "minute" },
		rateLimitRemaining: null,
	};
}

const oauthSession: UserAuth = {
	kind: "user",
	userId: "user_1",
	email: "someone@example.com",
	name: "Someone",
	organizationIds: ["org_1"],
	clientId: "client_1",
	expiresAt: null,
};

function names(auth: Parameters<typeof toolsFor>[0]): string[] {
	return toolsFor(auth).map((tool) => tool.name);
}

function setMode(mode: "local" | "demo") {
	vi.stubEnv("DEPLOYMENT_MODE", mode);
	resetDeploymentCache();
}

beforeEach(() => setMode("local"));

afterEach(() => {
	vi.unstubAllEnvs();
	resetDeploymentCache();
});

describe("the tool registry", () => {
	it("names every tool once, in the snake_case MCP clients expect", () => {
		const seen = MCP_TOOLS.map((tool) => tool.name);
		expect(new Set(seen).size).toBe(seen.length);
		for (const name of seen) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
	});

	it("asks only for scopes the API actually issues", () => {
		for (const tool of MCP_TOOLS) {
			for (const scope of tool.scopes) expect(API_SCOPES).toContain(scope);
		}
	});

	it("writes from exactly the tools that say they do", () => {
		const writers = MCP_TOOLS.filter((tool) => !tool.readOnly).map((tool) => tool.name);
		expect(writers.sort()).toEqual([...WRITE_TOOLS].sort());
	});

	it("offers nothing that deletes and nothing that creates a brand or workspace", () => {
		const names = MCP_TOOLS.map((tool) => tool.name);
		for (const forbidden of ["delete_prompt", "delete_brand", "create_brand", "create_organization"]) {
			expect(names).not.toContain(forbidden);
		}
		for (const name of names) expect(name).not.toMatch(/^delete_/);
	});

	it("asks for no scope the API no longer issues", () => {
		for (const tool of MCP_TOOLS) {
			for (const scope of tool.scopes) expect(API_SCOPES).toContain(scope);
		}
		expect(TOOL_SCOPES).toContain("billing:read");
	});
});

describe("which tools a connection is offered", () => {
	it("gives an admin key the same tools as a fully scoped organization key, and no more", () => {
		expect(names(adminKey).sort()).toEqual(names(orgKey([...API_SCOPES])).sort());
	});

	it("gives an OAuth session everything, because it is the person", () => {
		expect(names(oauthSession).sort()).toEqual(MCP_TOOLS.map((tool) => tool.name).sort());
	});

	it("gives a key with no scopes only the tools that need none", () => {
		expect(names(orgKey([])).sort()).toEqual([...UNSCOPED_TOOLS].sort());
	});

	it("offers no writer to a read-only key", () => {
		const readOnlyKey = orgKey(API_SCOPES.filter((scope) => !scope.endsWith(":write") && !scope.endsWith(":delete")));
		for (const write of WRITE_TOOLS) expect(names(readOnlyKey)).not.toContain(write);
		expect(names(readOnlyKey)).toContain("list_prompts");
	});

	it("offers billing only to a key issued the billing scope", () => {
		expect(names(orgKey(["brands:read"]))).not.toContain("get_billing");
		expect(names(orgKey(["billing:read"]))).toContain("get_billing");
	});

	it("does not offer analytics to a key that only reads prompts", () => {
		const offered = names(orgKey(["prompts:read"]));
		expect(offered).toContain("list_prompts");
		expect(offered).not.toContain("get_analytics");
		expect(offered).not.toContain("get_citations");
	});

	it("drops every writer in a read-only deployment, whatever the key holds", () => {
		setMode("demo");
		const offered = names(orgKey([...API_SCOPES]));
		for (const write of WRITE_TOOLS) expect(offered).not.toContain(write);
		expect(offered).toContain("get_analytics");
		expect(offered).toContain("list_prompts");
	});

	it("drops every writer in a read-only deployment even for an admin key", () => {
		setMode("demo");
		expect(names(adminKey)).not.toContain("create_prompts");
		expect(names(adminKey)).not.toContain("update_prompt");
	});
});
