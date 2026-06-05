/**
 * Mock for @/server/analysis used in Storybook stories. The real module imports
 * pg via the postgres read layer, which is not browser-safe.
 *
 * Stories set data via setMockShareOfVoice()/setMockOpportunities(); the real
 * useShareOfVoice / usePromptOpportunities hooks call these through react-query.
 */

// biome-ignore lint/suspicious/noExplicitAny: loose mock shapes for stories
type Any = any;

export type ShareOfVoiceResponse = Any;
export type PromptOpportunitiesResponse = Any;
export type PromptOpportunity = Any;

let _sov: Any = null;
let _opps: Any = null;

export function setMockShareOfVoice(data: Any) {
	_sov = data;
}

export function setMockOpportunities(data: Any) {
	_opps = data;
}

export const getShareOfVoiceFn = async (..._args: unknown[]) => _sov;
export const getPromptOpportunitiesFn = async (..._args: unknown[]) => _opps;
