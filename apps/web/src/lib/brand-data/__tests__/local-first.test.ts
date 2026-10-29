import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ canComputeLocally: vi.fn(), computeLocally: vi.fn() }));
const server = vi.hoisted(() => vi.fn());

vi.mock("@/lib/brand-data/client", () => client);
vi.mock("@/server/dashboard", () => ({ getDashboardSummaryFn: server }));

const { getDashboardSummaryFn } = await import("@/lib/brand-data/local-first");
const request = { data: { brandId: "b", lookback: "1m" as const } };

describe("local-first analytics", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		server.mockResolvedValue("from server");
	});

	it("asks the server until the brand's data has synced", async () => {
		client.canComputeLocally.mockReturnValue(false);
		await expect(getDashboardSummaryFn(request)).resolves.toBe("from server");
		expect(client.computeLocally).not.toHaveBeenCalled();
	});

	it("answers locally once it has", async () => {
		client.canComputeLocally.mockReturnValue(true);
		client.computeLocally.mockResolvedValue("from browser");
		await expect(getDashboardSummaryFn(request)).resolves.toBe("from browser");
		expect(server).not.toHaveBeenCalled();
	});

	it("falls back to the server when the local computation fails", async () => {
		client.canComputeLocally.mockReturnValue(true);
		client.computeLocally.mockRejectedValue(new Error("worker gone"));
		await expect(getDashboardSummaryFn(request)).resolves.toBe("from server");
	});
});
