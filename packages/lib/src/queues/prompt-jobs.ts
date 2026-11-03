export const PROCESS_PROMPT_QUEUE = "process-prompt";

// A retry or mid-run expiry would pay for the whole provider fan-out twice, so the expiry
// outlasts the slowest provider's task ceiling and failures recover via reschedule instead.
export const PROMPT_JOB_OPTIONS = {
	retryLimit: 0,
	expireInSeconds: 90 * 60,
} as const;

export const PROMPT_SINGLETON_SECONDS = 60 * 60;

export function promptSingletonKey(promptId: string): string {
	return `prompt-${promptId}`;
}
