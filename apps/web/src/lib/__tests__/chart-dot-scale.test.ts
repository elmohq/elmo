import { describe, expect, it } from "vitest";
import { dotScaleForPointCount } from "@/lib/chart-utils";

describe("dotScaleForPointCount", () => {
	it("shows full-size dots for a week or a month of daily points", () => {
		expect(dotScaleForPointCount(7)).toBe(1);
		expect(dotScaleForPointCount(31)).toBe(1);
	});

	it("shrinks dots for a quarter of daily points", () => {
		const scale = dotScaleForPointCount(90);
		expect(scale).toBeGreaterThan(0);
		expect(scale).toBeLessThan(1);
	});

	it("hides dots for six months or more of daily points", () => {
		expect(dotScaleForPointCount(182)).toBe(0);
		expect(dotScaleForPointCount(365)).toBe(0);
	});
});
