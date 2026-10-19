import { describe, expect, it } from "vitest";
import { type FanoutEngineHistoryRow, fanoutEngineStatus, statusPerModel } from "@/lib/fanout-engine-status";

const now = new Date("2026-10-19T12:00:00.000Z");

const history = (overrides: Partial<FanoutEngineHistoryRow> = {}): FanoutEngineHistoryRow => ({
	model: "chatgpt",
	provider: "brightdata",
	search_runs: 2000,
	fanout_runs: 0,
	first_fanout_at: null,
	last_fanout_at: null,
	search_runs_since_last_fanout: 2000,
	last_run_at: "2026-10-19T00:00:00.000Z",
	...overrides,
});

describe("fanoutEngineStatus", () => {
	it("reports an engine still returning queries as available", () => {
		const status = fanoutEngineStatus({
			brand: history({
				fanout_runs: 900,
				first_fanout_at: "2026-08-10T00:00:00.000Z",
				last_fanout_at: "2026-10-18T00:00:00.000Z",
				search_runs_since_last_fanout: 30,
			}),
			support: "supported",
			now,
		});
		expect(status.state).toBe("available");
	});

	it("flags an engine that went quiet for a week across many runs as stopped", () => {
		const status = fanoutEngineStatus({
			brand: history({
				fanout_runs: 1121,
				first_fanout_at: "2026-08-11T00:00:00.000Z",
				last_fanout_at: "2026-09-28T00:00:00.000Z",
				search_runs_since_last_fanout: 3815,
			}),
			support: "supported",
			now,
		});
		expect(status).toMatchObject({ state: "stopped", basis: "brand", lastFanoutAt: "2026-09-28T00:00:00.000Z" });
	});

	it("doesn't call a low-volume engine stopped just because it's been a while", () => {
		const status = fanoutEngineStatus({
			brand: history({ fanout_runs: 4, last_fanout_at: "2026-09-17T00:00:00.000Z", search_runs_since_last_fanout: 12 }),
			support: "supported",
			now,
		});
		expect(status.state).toBe("available");
	});

	it("tells a brand that never got queries when the engine stopped for everyone else", () => {
		const status = fanoutEngineStatus({
			brand: history(),
			deployment: history({
				fanout_runs: 2090,
				last_fanout_at: "2026-09-28T00:00:00.000Z",
				search_runs_since_last_fanout: 34000,
			}),
			support: "supported",
			now,
		});
		expect(status).toMatchObject({ state: "stopped", basis: "deployment", lastFanoutAt: "2026-09-28T00:00:00.000Z" });
	});

	it("explains an engine the provider can't expose as unsupported", () => {
		const status = fanoutEngineStatus({ brand: history({ model: "gemini" }), support: "unsupported", now });
		expect(status.state).toBe("unsupported");
	});

	it("waits on an engine that should expose queries but hasn't yet", () => {
		const status = fanoutEngineStatus({ brand: history({ model: "perplexity" }), support: "supported", now });
		expect(status.state).toBe("none-yet");
	});
});

describe("statusPerModel", () => {
	it("reports the working provider when a model is tracked through two", () => {
		const stopped = fanoutEngineStatus({
			brand: history({ last_fanout_at: "2026-09-28T00:00:00.000Z", search_runs_since_last_fanout: 3815 }),
			support: "supported",
			now,
		});
		const available = fanoutEngineStatus({
			brand: history({
				provider: "cloro",
				fanout_runs: 500,
				first_fanout_at: "2026-10-10T00:00:00.000Z",
				last_fanout_at: "2026-10-19T00:00:00.000Z",
				search_runs_since_last_fanout: 0,
			}),
			support: "supported",
			now,
		});
		expect(statusPerModel([stopped, available])).toEqual([available]);
	});
});
