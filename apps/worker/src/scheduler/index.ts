import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import * as Sentry from "@sentry/node";
import { RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { type ModelConfig, selectTargetsForBrand } from "@workspace/lib/providers";
import { getPromptRunConcurrency } from "@workspace/lib/scheduler";
import { executeClaimedRun } from "./executor";
import {
	claimDueSchedule,
	claimExecutionRun,
	materializeScheduleClaim,
	pauseScheduleAfterMaterializationError,
	reconcilePromptSchedules,
	recoverExpiredWork,
	releasePreparedRun,
	releaseResumableWork,
} from "./store";

const IDLE_POLL_MS = 1000;
const RECONCILE_INTERVAL_MS = 30_000;
const MAX_LOOP_BACKOFF_MS = 30_000;

function reportSchedulerError(error: unknown, operation: string): void {
	console.error(`[scheduler] ${operation} failed:`, error);
	Sentry.withScope((scope) => {
		scope.setTag("scheduler", "durable-prompt-runs");
		scope.setTag("operation", operation);
		Sentry.captureException(error);
	});
}

export class DurablePromptScheduler {
	readonly workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
	readonly localConcurrency = getPromptRunConcurrency();

	constructor(private readonly scrapeTargets: ModelConfig[]) {}

	private running = false;
	private loopPromise: Promise<void> | null = null;
	private active = new Set<Promise<void>>();
	private wakeIdle: (() => void) | null = null;
	private nextReconcileAt = 0;

	async start(): Promise<void> {
		if (this.running) return;
		await reconcilePromptSchedules();
		await recoverExpiredWork();
		this.nextReconcileAt = Date.now() + RECONCILE_INTERVAL_MS;
		this.running = true;
		this.loopPromise = this.runLoop();
		console.log(`[scheduler] Started durable prompt scheduler (local concurrency ${this.localConcurrency})`);
	}

	async stop(timeoutMs = 30_000): Promise<void> {
		if (!this.running && !this.loopPromise) return;
		this.running = false;
		this.wakeIdle?.();

		const settle = Promise.allSettled([...(this.loopPromise ? [this.loopPromise] : []), ...this.active]);
		let timeout: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			settle,
			new Promise<void>((resolve) => {
				timeout = setTimeout(resolve, timeoutMs);
			}),
		]);
		if (timeout) clearTimeout(timeout);

		await releaseResumableWork(this.workerId);
		this.loopPromise = null;
		console.log(`[scheduler] Stopped durable prompt scheduler (${this.active.size} local run(s) still active)`);
	}

	private async runLoop(): Promise<void> {
		let consecutiveErrors = 0;
		while (this.running) {
			try {
				if (Date.now() >= this.nextReconcileAt) {
					await reconcilePromptSchedules();
					await recoverExpiredWork();
					this.nextReconcileAt = Date.now() + RECONCILE_INTERVAL_MS;
				}

				const materialized = await this.materializeOneDueSchedule();
				let claimed = false;
				while (this.running && this.active.size < this.localConcurrency) {
					const run = await claimExecutionRun({ workerId: this.workerId });
					if (!run) break;
					if (!this.running) {
						await releasePreparedRun(run.id, this.workerId);
						break;
					}
					claimed = true;
					this.execute(run);
				}

				consecutiveErrors = 0;
				if (!materialized && !claimed) await this.idle(IDLE_POLL_MS);
			} catch (error) {
				consecutiveErrors++;
				reportSchedulerError(error, "scheduler loop");
				const delay = Math.min(2 ** Math.min(consecutiveErrors - 1, 5) * 1000, MAX_LOOP_BACKOFF_MS);
				await this.idle(delay);
			}
		}
	}

	private async materializeOneDueSchedule(): Promise<boolean> {
		const claim = await claimDueSchedule(this.workerId);
		if (!claim) return false;

		try {
			const targets = selectTargetsForBrand(this.scrapeTargets, claim.enabledModels);
			const execution = await materializeScheduleClaim({
				claim,
				workerId: this.workerId,
				targets,
				runsPerTarget: RUNS_PER_PROMPT,
			});
			if (execution) {
				console.log(
					`[scheduler] Materialized ${execution.trigger} execution ${execution.executionId} for ` +
						`${claim.promptId} with ${execution.runCount} run(s)`,
				);
			}
			return !!execution;
		} catch (error) {
			await pauseScheduleAfterMaterializationError(claim.promptId, this.workerId, error);
			throw error;
		}
	}

	private execute(run: Parameters<typeof executeClaimedRun>[0]): void {
		let promise: Promise<void>;
		promise = executeClaimedRun(run, this.workerId)
			.catch((error) => reportSchedulerError(error, `execution run ${run.id}`))
			.finally(() => {
				this.active.delete(promise);
				this.wakeIdle?.();
			});
		this.active.add(promise);
	}

	private async idle(ms: number): Promise<void> {
		if (!this.running) return;
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				this.wakeIdle = null;
				resolve();
			}, ms);
			this.wakeIdle = () => {
				clearTimeout(timeout);
				this.wakeIdle = null;
				resolve();
			};
		});
	}
}
