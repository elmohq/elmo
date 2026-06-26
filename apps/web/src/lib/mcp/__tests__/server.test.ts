import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ----------------------------------------------------------------

// prompts-core: every CRUD function is a spy so the prompt tools delegate to
// us. A real-ish PromptNotFoundError lets us assert thrown domain errors
// become MCP error results (not exceptions).
const { core, PromptNotFoundError } = vi.hoisted(() => {
	class PromptNotFoundError extends Error {
		constructor(public readonly promptId: string) {
			super(`Prompt "${promptId}" not found.`);
			this.name = "PromptNotFoundError";
		}
	}
	const core = {
		listPrompts: vi.fn(),
		getPromptById: vi.fn(),
		createPrompt: vi.fn(),
		updatePrompt: vi.fn(),
		deletePrompt: vi.fn(),
	};
	return { core, PromptNotFoundError };
});

vi.mock("@/server/prompts-core", () => ({ ...core, PromptNotFoundError }));

// deployment accessor backing assertWritable()
const { getDeployment } = vi.hoisted(() => ({ getDeployment: vi.fn() }));
vi.mock("@/lib/config/server", () => ({ getDeployment }));

// db.select(...).from(brands) -> MOCK_BRANDS for list_brands
const { MOCK_BRANDS, mockDb } = vi.hoisted(() => {
	const MOCK_BRANDS = [
		{ id: "b1", name: "Acme", website: "https://acme.com", enabled: true },
		{ id: "b2", name: "Globex", website: "https://globex.com", enabled: false },
	];
	const mockDb = { select: vi.fn(() => ({ from: vi.fn(() => MOCK_BRANDS) })) };
	return { MOCK_BRANDS, mockDb };
});
vi.mock("@workspace/lib/db/db", () => ({ db: mockDb }));

import { buildMcpServer, handleMcpPost, MCP_TOOLS, runTool } from "@/lib/mcp/server";
import type { ElmoTool } from "@/lib/mcp/types";

function tool(name: string): ElmoTool {
	const found = MCP_TOOLS.find((t) => t.name === name);
	if (!found) throw new Error(`tool ${name} not registered`);
	return found;
}

const setReadOnly = (readOnly: boolean) => getDeployment.mockReturnValue({ features: { readOnly } });

beforeEach(() => {
	vi.clearAllMocks();
	setReadOnly(false);
});

afterEach(() => {
	vi.unstubAllEnvs();
});

// --- Read-only whitelist via runTool --------------------------------------

describe("runTool read-only whitelist", () => {
	it("blocks a mutating tool (readOnlySafe: false) in read-only mode", async () => {
		setReadOnly(true);

		const result = await runTool(tool("create_prompt"), { brandId: "b1", value: "hi" });

		expect(result.isError).toBe(true);
		expect(core.createPrompt).not.toHaveBeenCalled();
		expect(result.content[0]?.text).toContain("read-only");
	});

	it("allows a read tool (readOnlySafe: true) in read-only mode", async () => {
		setReadOnly(true);

		const result = await runTool(tool("list_brands"), {});

		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe(JSON.stringify(MOCK_BRANDS));
	});

	it("allows a mutating tool when not read-only and returns the JSON result", async () => {
		setReadOnly(false);
		core.createPrompt.mockResolvedValue({ id: "p1", value: "hi" });

		const result = await runTool(tool("create_prompt"), { brandId: "b1", value: "hi", tags: ["x"] });

		expect(core.createPrompt).toHaveBeenCalledWith({ brandId: "b1", value: "hi", tags: ["x"] });
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toBe(JSON.stringify({ id: "p1", value: "hi" }));
	});
});

// --- Domain error -> isError ----------------------------------------------

describe("runTool domain errors", () => {
	it("maps a thrown domain error to an MCP error result", async () => {
		core.getPromptById.mockRejectedValue(new PromptNotFoundError("p1"));

		const result = await runTool(tool("get_prompt"), { promptId: "p1" });

		expect(result.isError).toBe(true);
		expect(JSON.parse(result.content[0]?.text ?? "null")).toEqual({ error: 'Prompt "p1" not found.' });
	});
});

// --- Arg mapping -----------------------------------------------------------

describe("runTool arg mapping", () => {
	it("update_prompt forwards promptId + partial fields (undefined for omitted)", async () => {
		core.updatePrompt.mockResolvedValue({ id: "p1", enabled: false });

		await runTool(tool("update_prompt"), { promptId: "p1", enabled: false });

		expect(core.updatePrompt).toHaveBeenCalledWith("p1", {
			value: undefined,
			enabled: false,
			tags: undefined,
		});
	});

	it("list_prompts forwards brandId + pagination", async () => {
		core.listPrompts.mockResolvedValue({ prompts: [], pagination: {} });

		await runTool(tool("list_prompts"), { brandId: "b1", enabled: true, page: 2, limit: 5 });

		expect(core.listPrompts).toHaveBeenCalledWith({
			brandId: "b1",
			enabled: true,
			page: 2,
			limit: 5,
		});
	});
});

// --- list_brands -----------------------------------------------------------

describe("list_brands", () => {
	it("returns the brands from the db select, JSON-stringified", async () => {
		const result = await runTool(tool("list_brands"), {});

		expect(mockDb.select).toHaveBeenCalled();
		expect(result.content[0]?.text).toBe(JSON.stringify(MOCK_BRANDS));
		expect(result.isError).toBeUndefined();
	});
});

// --- Registry sanity -------------------------------------------------------

describe("MCP_TOOLS registry", () => {
	it("includes the six expected tools with correct read-only flags", () => {
		const names = MCP_TOOLS.map((t) => t.name).sort();
		expect(names).toEqual(
			["create_prompt", "delete_prompt", "get_prompt", "list_brands", "list_prompts", "update_prompt"].sort(),
		);

		const mutating = ["create_prompt", "update_prompt", "delete_prompt"];
		for (const t of MCP_TOOLS) {
			expect(t.readOnlySafe).toBe(!mutating.includes(t.name));
		}
	});

	it("buildMcpServer registers every tool without throwing", () => {
		expect(() => buildMcpServer()).not.toThrow();
		expect(buildMcpServer()).toBeDefined();
	});
});

// --- handleMcpPost auth (no transport reached on these paths) --------------

describe("handleMcpPost auth", () => {
	it("returns 404 when MCP_API_KEY is unset", async () => {
		vi.stubEnv("MCP_API_KEY", "");

		const res = await handleMcpPost(new Request("http://x/api/mcp", { method: "POST" }));

		expect(res.status).toBe(404);
	});

	it("returns 401 with no Authorization header", async () => {
		vi.stubEnv("MCP_API_KEY", "secret");

		const res = await handleMcpPost(new Request("http://x/api/mcp", { method: "POST" }));

		expect(res.status).toBe(401);
	});

	it("returns 401 with a wrong Bearer token", async () => {
		vi.stubEnv("MCP_API_KEY", "secret");

		const res = await handleMcpPost(
			new Request("http://x/api/mcp", { method: "POST", headers: { Authorization: "Bearer wrong" } }),
		);

		expect(res.status).toBe(401);
	});
});

// NOTE: The full JSON-RPC round-trip (auth -> initialize -> tools/list) is NOT
// exercised here. handleMcpPost builds a fresh stateless transport per request
// (mirroring the SDK's Hono/Workers examples), and the transport rejects any
// non-initialize request with "Server not initialized" until the init handshake
// has run on that same transport instance. A single POST therefore cannot both
// initialize and list, so a round-trip would require multi-request session
// gymnastics that are brittle under vitest. That path is covered by the manual
// MCP Inspector verification step instead.
