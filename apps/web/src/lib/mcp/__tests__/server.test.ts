/**
 * The protocol side: what a real MCP client sees when it connects.
 *
 * Driven through the SDK's own client over a linked in-memory transport rather
 * than by inspecting our objects, because the thing worth checking is the wire:
 * that the tools we register are the tools that get advertised, that a refusal
 * arrives as a tool error a model can read rather than as a protocol fault, and
 * that an unexpected failure says nothing about what went wrong.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { resetDeploymentCache } from "@workspace/deployment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api/handler";
import type { AdminAuth } from "@/lib/auth/api-auth";
import { createMcpServer, MCP_SERVER_INFO } from "../server";
import { MCP_TOOLS, type McpTool } from "../tools";

const adminKey: AdminAuth = { kind: "admin", scopes: null, organizationId: null };

function stubTool(overrides: Partial<McpTool> & Pick<McpTool, "name" | "run">): McpTool {
	return {
		title: overrides.name,
		description: `a stub named ${overrides.name}`,
		scopes: [],
		readOnly: true,
		input: {},
		...overrides,
	} as McpTool;
}

async function connect(tools: McpTool[]) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "0" });
	const server = createMcpServer(adminKey, tools);
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	return { client, close: () => Promise.all([client.close(), server.close()]) };
}

/**
 * The single text block every tool answers with. Typed off `unknown` because
 * `callTool` still admits the protocol's legacy result shape, which has no
 * `content` at all.
 */
function textOf(result: unknown): string {
	const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
	return content[0]?.text ?? "";
}

beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	resetDeploymentCache();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	resetDeploymentCache();
});

describe("the MCP server", () => {
	it("introduces itself with a version a client can report", async () => {
		const { client, close } = await connect([]);
		expect(client.getServerVersion()).toMatchObject({ name: MCP_SERVER_INFO.name });
		expect(client.getInstructions()).toContain("list_brands");
		await close();
	});

	it("advertises exactly the tools it was given, with their annotations", async () => {
		const { client, close } = await connect([
			stubTool({ name: "reader", run: async () => ({}) }),
			stubTool({ name: "writer", readOnly: false, run: async () => ({}) }),
		]);

		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual(["reader", "writer"]);
		expect(tools.find((tool) => tool.name === "reader")?.annotations).toMatchObject({ readOnlyHint: true });
		expect(tools.find((tool) => tool.name === "writer")?.annotations).toMatchObject({ readOnlyHint: false });
		await close();
	});

	it("publishes each tool's arguments so a client can fill them in", async () => {
		const { client, close } = await connect([
			stubTool({
				name: "needs_a_brand",
				input: { brandId: z.string().describe("Which brand.") },
				run: async () => ({}),
			}),
		]);

		const { tools } = await client.listTools();
		expect(tools[0].inputSchema).toMatchObject({
			type: "object",
			properties: { brandId: { type: "string", description: "Which brand." } },
			required: ["brandId"],
		});
		await close();
	});

	it("returns the tool's result as JSON text", async () => {
		const { client, close } = await connect([stubTool({ name: "counts", run: async () => ({ visibility: 0.42 }) })]);
		const result = await client.callTool({ name: "counts", arguments: {} });
		expect(result.isError).toBeFalsy();
		expect(JSON.parse(textOf(result))).toEqual({ visibility: 0.42 });
		await close();
	});

	it("passes validated arguments through to the tool", async () => {
		const seen: unknown[] = [];
		const { client, close } = await connect([
			stubTool({
				name: "echo",
				input: { brandId: z.string().describe("Which brand.") },
				run: async (_ctx, args) => {
					seen.push(args);
					return { ok: true };
				},
			}),
		]);
		await client.callTool({ name: "echo", arguments: { brandId: "acme" } });
		expect(seen).toEqual([{ brandId: "acme" }]);
		await close();
	});

	it("reports an expected refusal as a tool error the model can act on", async () => {
		const { client, close } = await connect([
			stubTool({
				name: "missing",
				run: async () => {
					throw new ApiError(404, "Not Found", 'Brand "ghost" not found.');
				},
			}),
		]);
		const result = await client.callTool({ name: "missing", arguments: {} });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toBe('Brand "ghost" not found.');
		await close();
	});

	it("passes an entitlement refusal through, since the message is the point", async () => {
		const denied = Object.assign(new Error("Your plan tracks up to 50 prompts."), { name: "WriteDeniedError" });
		const { client, close } = await connect([
			stubTool({
				name: "over_limit",
				readOnly: false,
				run: async () => {
					throw denied;
				},
			}),
		]);
		const result = await client.callTool({ name: "over_limit", arguments: {} });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toBe("Your plan tracks up to 50 prompts.");
		await close();
	});

	it("says nothing about an unexpected failure beyond that there was one", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		const { client, close } = await connect([
			stubTool({
				name: "explodes",
				run: async () => {
					throw new Error("connection to 10.0.0.4:5432 refused");
				},
			}),
		]);
		const result = await client.callTool({ name: "explodes", arguments: {} });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toBe("The tool failed unexpectedly.");
		expect(textOf(result)).not.toContain("10.0.0.4");
		// Unreadable to the caller, but not lost: the operator still gets it.
		expect(logged).toHaveBeenCalled();
		await close();
	});

	it("describes every real tool and every argument, since that is all a model has to go on", async () => {
		const { client, close } = await connect([...MCP_TOOLS]);
		const { tools } = await client.listTools();

		expect(tools).toHaveLength(MCP_TOOLS.length);
		for (const tool of tools) {
			expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(20);
			const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
			for (const [arg, schema] of Object.entries(properties)) {
				expect(schema.description, `${tool.name}.${arg}`).toBeTruthy();
			}
		}
		await close();
	});

	it("refuses a tool it was never given", async () => {
		const { client, close } = await connect([stubTool({ name: "reader", run: async () => ({}) })]);
		const result = await client.callTool({ name: "delete_prompt", arguments: {} });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("delete_prompt");
		await close();
	});
});
