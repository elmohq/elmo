/**
 * Mock for @/server/prompt-bulk used in Storybook: previews computed from a
 * tiny in-memory model of the story's rows, commits that succeed.
 */

export const BULK_STATUS_FAILED = "The status change failed and nothing was changed. Try again.";
export const DELETE_FAILED = "The delete failed and nothing was removed. Review the delete again.";
export const TAG_REMOVAL_FAILED = "Removing the tag failed and nothing was changed. Try again.";

/** Stories set this to describe the rows the mock knows about. */
export const mockBulk: { rows: { id: string; enabled: boolean; tags: string[] }[]; allIds: string[] } = {
	rows: [],
	allIds: [],
};

export const listPromptIdsFn = async () => ({ ids: mockBulk.allIds, total: mockBulk.allIds.length });

export const previewBulkStatusFn = async ({ data }: { data: { ids: string[]; enabled: boolean } }) => {
	const known = mockBulk.rows.filter((r) => data.ids.includes(r.id));
	const changing = known.filter((r) => r.enabled !== data.enabled).length;
	return {
		enabled: data.enabled,
		selected: data.ids.length,
		alreadyInState: known.length - changing,
		changing,
		unknown: data.ids.length - known.length,
		chainsToStart: data.enabled ? changing : 0,
		cadenceHours: 24,
		queuedJobs: data.enabled ? 0 : changing,
		activeJobs: 0,
	};
};
export const commitBulkStatusFn = async ({ data }: { data: { ids: string[]; enabled: boolean } }) => ({
	changed: mockBulk.rows.filter((r) => data.ids.includes(r.id) && r.enabled !== data.enabled).length,
	cancelledJobs: 0,
	activeJobs: 0,
});

export const previewDeleteFn = async ({ data }: { data: { ids: string[] } }) => {
	const known = mockBulk.rows.filter((r) => data.ids.includes(r.id));
	const enabled = known.filter((r) => r.enabled).length;
	const blockers =
		enabled > 0
			? [`${enabled} selected prompt${enabled === 1 ? " is" : "s are"} still enabled. Disable them first.`]
			: [];
	return {
		selected: data.ids.length,
		blockers,
		counts: {
			prompts: known.length,
			promptRuns: known.length * 3,
			citations: known.length * 7,
			entityMentions: known.length * 2,
			sentimentDetections: known.length * 3,
			sentimentAnalyses: known.length * 2,
			sentimentObservations: known.length * 2,
			sentimentAspectObservations: known.length,
			sentimentFilteredClaims: 0,
			sentimentResolutionCases: 1,
			sentimentDispatchPermits: 1,
			sentimentProviderAttempts: known.length * 4,
			sentimentAttemptCostUsd: (known.length * 0.0251).toFixed(6),
			promptJobsQueued: 0,
			promptJobsActive: 0,
			sentimentJobsPending: 0,
			effectivePermits: 0,
			usageEventsKept: known.length * 5,
		},
		digest: "mock-digest",
		phrase: `DELETE ${data.ids.length} PROMPTS`,
		batchCap: 10_000,
	};
};
export const commitDeleteFn = async ({ data }: { data: { ids: string[] } }) => ({
	deleted: data.ids.length,
	counts: (await previewDeleteFn({ data })).counts,
	cancelledJobs: 0,
});

export const previewTagRemovalFn = async ({ data }: { data: { tag: string } }) => {
	const tag = data.tag.trim().toLowerCase();
	return { tag, affectedPrompts: mockBulk.rows.filter((r) => r.tags.includes(tag)).length, phrase: `REMOVE ${tag}` };
};
export const commitTagRemovalFn = async ({ data }: { data: { tag: string } }) => ({
	tag: data.tag,
	updated: mockBulk.rows.filter((r) => r.tags.includes(data.tag)).length,
});
