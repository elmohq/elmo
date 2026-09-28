/**
 * Mock for @/server/prompt-import used in Storybook stories: a review that
 * counts the lines like the server does, and a commit that succeeds.
 */

export const PROMPT_IMPORT_FAILED = "The import failed and nothing was added. Your text is still here — try again.";

export const reviewPromptImportFn = async ({ data }: { data: { text: string; enabled: boolean } }) => {
	const lines = data.text.split(/\r?\n/);
	const nonBlank = lines.filter((line) => line.trim().length > 0);
	return {
		summary: {
			lines: lines.length,
			added: nonBlank.length,
			blank: lines.length - nonBlank.length,
			duplicateOfExisting: 0,
			duplicateInPaste: 0,
			overCapacity: 0,
			missingPrompt: 0,
			samples: { duplicateOfExisting: [], duplicateInPaste: [], overCapacity: [], missingPrompt: [] },
		},
		enabled: data.enabled,
		brandTotal: 24,
		room: 9_976,
		token: "mock-token",
	};
};

export const commitPromptImportFn = async ({ data }: { data: { text: string; enabled: boolean } }) => ({
	inserted: data.text.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
	enabled: data.enabled,
});
