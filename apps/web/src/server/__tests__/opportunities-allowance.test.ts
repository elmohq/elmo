import { OPPORTUNITIES_GENERATIONS_PER_DAY } from "@workspace/lib/constants";
import { describe, expect, it } from "vitest";
import { generationAllowance } from "@/server/opportunities";

const NOW = new Date("2026-11-06T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(NOW - hours * HOUR);

describe("generationAllowance", () => {
	it("allows a generation when the brand has none stored", () => {
		expect(generationAllowance([], NOW)).toEqual({ allowed: true });
	});

	it("allows a generation while the day's count is under the limit", () => {
		const recent = Array.from({ length: OPPORTUNITIES_GENERATIONS_PER_DAY - 1 }, (_, i) => hoursAgo(i + 1));
		expect(generationAllowance(recent, NOW)).toEqual({ allowed: true });
	});

	it("refuses once the limit is reached, resetting when the oldest generation ages out", () => {
		const recent = Array.from({ length: OPPORTUNITIES_GENERATIONS_PER_DAY }, (_, i) => hoursAgo(i + 1));
		const oldest = hoursAgo(OPPORTUNITIES_GENERATIONS_PER_DAY);
		expect(generationAllowance(recent, NOW)).toEqual({
			allowed: false,
			resetsAt: new Date(oldest.getTime() + 24 * HOUR),
		});
	});

	it("ignores generations older than a day", () => {
		const recent = [
			...Array.from({ length: OPPORTUNITIES_GENERATIONS_PER_DAY - 1 }, (_, i) => hoursAgo(i + 1)),
			hoursAgo(24),
			hoursAgo(30),
		];
		expect(generationAllowance(recent, NOW)).toEqual({ allowed: true });
	});
});
