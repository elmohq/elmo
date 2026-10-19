/**
 * Mock for @/server/query-fanout used in Storybook stories — the real module
 * reaches the rollup tables through pg, which is not browser-safe.
 */
import type { QueryFanoutResponse } from "@/server/query-fanout";

let _fanout: QueryFanoutResponse | null = null;

export function setMockQueryFanout(data: QueryFanoutResponse) {
	_fanout = data;
}

export const getQueryFanoutFn = async (..._args: unknown[]) => _fanout;
