/**
 * Mock for @/server/opportunities used in Storybook. The real module builds a
 * digest from the DB and makes an LLM call, neither of which is browser-safe.
 * The types come from it all the same — `import type` is erased before
 * Storybook's alias redirects the module, so a story can't drift from the real
 * response shape.
 *
 * Stories set the response via setMockOpportunities().
 */
import type { OpportunitiesResponse } from "@/server/opportunities";

export type { OpportunitiesReport, OpportunitiesResponse } from "@/server/opportunities";

let _report: OpportunitiesResponse | null = null;

export function setMockOpportunities(data: OpportunitiesResponse) {
	_report = data;
}

export const getOpportunitiesFn = async (..._args: unknown[]) => _report;
