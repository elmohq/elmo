/**
 * Mock for @/server/prompts used in Storybook stories. Stubs every server
 * function from the real module so that components which import them can
 * bundle without pulling in pg / drizzle / db code.
 */

const noop = async (..._args: unknown[]) => undefined;

export const getPromptMetadataFn = noop;
export const getPromptsSummaryFn = noop;
export const getPromptStatsFn = noop;
export const getPromptRunsFn = noop;

// Echoes back the saved rows the way the real handler does, minting ids for
// inserts, so the editor's post-save reset is exercisable in a story.
export const updatePromptsFn = async ({
	data,
}: {
	data: { prompts: Array<{ id?: string; value: string; enabled?: boolean; tags?: string[] }> };
}) =>
	data.prompts.map((p, i) => ({
		id: p.id ?? `mock-new-${i}`,
		value: p.value,
		enabled: p.enabled ?? true,
		tags: p.tags ?? [],
		systemTags: [] as string[],
	}));
export const getPromptChartDataFn = noop;
export const getPromptWebQueryFn = noop;
