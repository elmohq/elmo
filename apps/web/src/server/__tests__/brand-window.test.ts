import { beforeEach, describe, expect, it, vi } from "vitest";

const getBrandEarliestRunDate = vi.hoisted(() => vi.fn<(brandId: string) => Promise<string | null>>());
vi.mock("@/lib/postgres-read", () => ({ getBrandEarliestRunDate }));

const { resolveBrandWindow } = await import("@/server/brand-window");

const now = new Date("2024-03-31T12:00:00Z");

beforeEach(() => {
	getBrandEarliestRunDate.mockReset();
	getBrandEarliestRunDate.mockResolvedValue(null);
});

describe("the window a lookback stands for", () => {
	it("keeps a bounded lookback's calendar window, without asking about the brand", async () => {
		await expect(resolveBrandWindow("brand", "1m", "UTC", { now })).resolves.toEqual({
			timezone: "UTC",
			fromDateStr: "2024-02-29",
			toDateStr: "2024-03-31",
		});
		expect(getBrandEarliestRunDate).not.toHaveBeenCalled();
	});

	it("opens 'all' at the brand's first run rather than at a fixed horizon", async () => {
		getBrandEarliestRunDate.mockResolvedValue("2021-07-04T09:15:00Z");

		await expect(resolveBrandWindow("brand", "all", "UTC", { now })).resolves.toEqual({
			timezone: "UTC",
			fromDateStr: "2021-07-04",
			toDateStr: "2024-03-31",
		});
	});

	it("reads the first run as a calendar day in the viewer's timezone", async () => {
		// 23:30 UTC is already the next day in Tokyo and still the same one in Los
		// Angeles, and the window is spelled in calendar days.
		getBrandEarliestRunDate.mockResolvedValue("2021-07-04T23:30:00Z");

		await expect(resolveBrandWindow("brand", "all", "Asia/Tokyo", { now })).resolves.toMatchObject({
			timezone: "Asia/Tokyo",
			fromDateStr: "2021-07-05",
		});
		await expect(resolveBrandWindow("brand", "all", "America/Los_Angeles", { now })).resolves.toMatchObject({
			timezone: "America/Los_Angeles",
			fromDateStr: "2021-07-04",
		});
	});

	it("gives a brand with no runs today for both bounds", async () => {
		// Late enough in the UTC day that Tokyo is already on the next one.
		const boundary = new Date("2024-03-31T23:30:00Z");

		await expect(resolveBrandWindow("brand", "all", "Asia/Tokyo", { now: boundary })).resolves.toEqual({
			timezone: "Asia/Tokyo",
			fromDateStr: "2024-04-01",
			toDateStr: "2024-04-01",
		});
	});
});
