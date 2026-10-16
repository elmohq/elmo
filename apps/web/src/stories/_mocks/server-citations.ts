/**
 * Mock for @/server/citations used in Storybook stories. The real module
 * imports pg via @workspace/lib/db, which is not browser-safe.
 */
import { type CitationFlowRow, matchesDomain } from "@/lib/citation-flow";

let _citations: unknown;
let _flowRows: CitationFlowRow[] = [];

export function setMockCitations(data: unknown) {
	_citations = data;
}

/** Every page's rows; the mock answers a domain the way the server read does. */
export function setMockCitationFlowRows(rows: CitationFlowRow[]) {
	_flowRows = rows;
}

export const getCitationsFn = async (..._args: unknown[]) => _citations;

export const getCitationFlowFn = async ({ data }: { data: { domain: string } }) =>
	_flowRows.filter((row) => matchesDomain(new URL(row.url).hostname, data.domain));
