import type { FanoutSupport } from "@workspace/lib/providers/fanout-support";

export interface FanoutEngineHistoryRow {
	model: string;
	provider: string;
	search_runs: number;
	fanout_runs: number;
	first_fanout_at: string | null;
	last_fanout_at: string | null;
	search_runs_since_last_fanout: number;
	last_run_at: string;
}

export type FanoutEngineState = "available" | "stopped" | "unsupported" | "none-yet";

export interface FanoutEngineStatus {
	model: string;
	state: FanoutEngineState;
	support: FanoutSupport;
	basis: "brand" | "deployment";
	searchRuns: number;
	fanoutRuns: number;
	firstFanoutAt: string | null;
	lastFanoutAt: string | null;
	searchRunsSinceLastFanout: number;
}

const STOPPED_MIN_DAYS = 7;
const STOPPED_MIN_RUNS = 50;

function wentQuiet(row: FanoutEngineHistoryRow, now: Date): boolean {
	if (!row.last_fanout_at) return false;
	const quietDays = (now.getTime() - new Date(row.last_fanout_at).getTime()) / 86_400_000;
	return quietDays >= STOPPED_MIN_DAYS && row.search_runs_since_last_fanout >= STOPPED_MIN_RUNS;
}

export function fanoutEngineStatus(input: {
	brand: FanoutEngineHistoryRow;
	deployment?: FanoutEngineHistoryRow;
	support: FanoutSupport;
	now: Date;
}): FanoutEngineStatus {
	const { brand, deployment, support, now } = input;
	const base = {
		model: brand.model,
		support,
		searchRuns: brand.search_runs,
		fanoutRuns: brand.fanout_runs,
	};
	const from = (row: FanoutEngineHistoryRow, state: FanoutEngineState, basis: "brand" | "deployment") => ({
		...base,
		state,
		basis,
		firstFanoutAt: row.first_fanout_at,
		lastFanoutAt: row.last_fanout_at,
		searchRunsSinceLastFanout: row.search_runs_since_last_fanout,
	});

	if (brand.last_fanout_at) return from(brand, wentQuiet(brand, now) ? "stopped" : "available", "brand");
	if (deployment?.last_fanout_at && wentQuiet(deployment, now)) return from(deployment, "stopped", "deployment");
	return from(brand, support === "unsupported" ? "unsupported" : "none-yet", "brand");
}

const STATE_RANK: Record<FanoutEngineState, number> = { available: 0, stopped: 1, "none-yet": 2, unsupported: 3 };

export function statusPerModel(statuses: FanoutEngineStatus[]): FanoutEngineStatus[] {
	const best = new Map<string, FanoutEngineStatus>();
	for (const status of statuses) {
		const current = best.get(status.model);
		if (!current || STATE_RANK[status.state] < STATE_RANK[current.state]) best.set(status.model, status);
	}
	return [...best.values()];
}
