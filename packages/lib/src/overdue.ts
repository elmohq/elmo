/**
 * Shared "is this prompt overdue?" logic so the admin dashboard, the scheduler's
 * self-healing pass, and the overdue Sentry alert all agree. Overdue is decided
 * per (prompt, model): a model with no recorded run counts as overdue once the
 * prompt is past the grace window — failed runs record no row, so a target broken
 * on one provider is overdue even while its other models stay fresh — and a model
 * whose last run predates the cadence-plus-grace window is overdue.
 */

export interface ModelOverdueStatus {
	isOverdue: boolean;
	/** How far past cadence the last run is, in ms; null when never run or on schedule. */
	overdueByMs: number | null;
}

/**
 * Overdue status for a single (prompt, model) target. `graceMs` defaults to 0 —
 * the dashboard's immediate view — while alerting passes a non-zero grace so
 * normal jitter and freshly-created prompts don't trip it.
 */
export function getModelOverdueStatus(params: {
	lastRunAt: Date | null | undefined;
	promptCreatedAt: Date;
	runFrequencyMs: number;
	now: number;
	graceMs?: number;
}): ModelOverdueStatus {
	const { lastRunAt, promptCreatedAt, runFrequencyMs, now, graceMs = 0 } = params;

	if (!lastRunAt) {
		return {
			isOverdue: now - new Date(promptCreatedAt).getTime() > graceMs,
			overdueByMs: null,
		};
	}

	const timeSinceRun = now - new Date(lastRunAt).getTime();
	if (timeSinceRun > runFrequencyMs + graceMs) {
		return { isOverdue: true, overdueByMs: timeSinceRun - runFrequencyMs };
	}
	return { isOverdue: false, overdueByMs: null };
}

/** Whether a prompt is overdue on any of its configured models. */
export function isPromptOverdue(params: {
	models: string[];
	lastRunByModel: Record<string, Date>;
	promptCreatedAt: Date;
	runFrequencyMs: number;
	now: number;
	graceMs?: number;
}): boolean {
	const { models, lastRunByModel, promptCreatedAt, runFrequencyMs, now, graceMs } = params;
	return models.some(
		(model) =>
			getModelOverdueStatus({
				lastRunAt: lastRunByModel[model],
				promptCreatedAt,
				runFrequencyMs,
				now,
				graceMs,
			}).isOverdue,
	);
}
