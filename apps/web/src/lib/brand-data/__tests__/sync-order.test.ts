import { describe, expect, it } from "vitest";
import { syncOrder } from "@/lib/brand-data/worker/sync";

describe("brand data sync order", () => {
	it("fetches everything the last 30 days needs, then older months newest first", () => {
		const ids = [
			"citations:2026-08",
			"urls:1",
			"runs:2026-08",
			"runs:2026-10",
			"pages:0",
			"citations:2026-09",
			"runs:2026-09",
			"citations:2026-10",
			"entities",
			"pages:1",
			"urls:0",
			"runs:2025-12",
			"citations:2025-12",
		];
		expect(syncOrder(ids, new Date("2026-10-20T12:00:00Z"))).toEqual([
			"entities",
			"runs:2026-09",
			"runs:2026-10",
			"pages:0",
			"pages:1",
			"citations:2026-09",
			"citations:2026-10",
			"urls:0",
			"urls:1",
			"runs:2026-08",
			"citations:2026-08",
			"runs:2025-12",
			"citations:2025-12",
		]);
	});
});
