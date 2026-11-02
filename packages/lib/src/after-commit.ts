/**
 * Run a task that was deferred until a write was durable — scheduling a job,
 * mostly, which has no business holding a transaction open or leaving a
 * schedule behind for a row that rolled back.
 *
 * The row is committed before any of this runs, so a failure here is not a
 * failed write and must not be answered as one. A caller told its write failed
 * retries it: a retried prompt batch creates the prompts a second time, and a
 * retried brand comes back 409 for the brand it just made. Agents driving the
 * MCP tools retry far more readily than people do.
 *
 * Dropping the task costs a cadence, not the data. The worker's maintenance
 * sweep schedules every enabled prompt that has no pending job, and alerts on
 * the ones that stay overdue.
 */
export async function runAfterCommit(task: () => Promise<unknown>): Promise<void> {
	try {
		await task();
	} catch (error) {
		console.error("Post-commit task failed; the write it follows is committed and stands:", error);
	}
}
