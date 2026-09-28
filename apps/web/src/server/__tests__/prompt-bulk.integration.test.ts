/**
 * Runs against the disposable E2E test database: `pnpm -C apps/web
 * test:integration` with DATABASE_URL pointing at it.
 *
 * Bulk operations act on exact ids, all or nothing: a selection is the
 * filter's ids in the brand; a status flip skips rows already there and
 * cancels the queued chains it disables; a delete refuses anything enabled,
 * foreign, stale or still being worked on and otherwise removes the prompt
 * with every row hanging off its runs while billing and the control log stay;
 * a tag removal touches only the tag array.
 */
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL must point at the seeded test stack");

const BRAND = "default";
const NIKE = "nike";
const ORG = "default";
const MARKER = "pmt10k-it-bulk";

const bulk = await import("@/server/prompt-bulk-load");
const { deletePhrase, removeTagPhrase, MAX_BULK_SELECTION } = await import("@/lib/prompt-bulk");
const { scheduleFirstPromptRuns } = await import("@/lib/job-scheduler");
const { getBoss } = await import("@/lib/boss-client");
const { db } = await import("@workspace/lib/db/db");
const { brands } = await import("@workspace/lib/db/schema");
const { eq } = await import("drizzle-orm");

const client = new pg.Client({ connectionString: DATABASE_URL });
const q = async <T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []) =>
	(await client.query<T>(text, params)).rows;
const n = async (text: string, params: unknown[] = []) => Number((await q<{ n: string }>(text, params))[0].n);
const query = (over: Partial<{ q: string; tag: string; status: "all" | "enabled" | "disabled" }> = {}) => ({
	page: 1,
	q: "",
	tag: "",
	status: "all" as const,
	...over,
});

async function loadBrand(id: string) {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, id) });
	if (!brand) throw new Error(`brand ${id} missing`);
	return brand;
}

/** `count` marker prompts, every second one disabled, every third one with a second tag. */
async function seedPrompts(brandId: string, count: number, prefix: string): Promise<string[]> {
	const rows = await q<{ id: string }>(
		`insert into prompts (brand_id, value, enabled, tags, system_tags)
		 select $1, $2 || ' ' || lpad(g::text, 4, '0'), g % 2 = 0,
		        case when g % 3 = 0 then array[$3, 'bulk-topic']::text[] else array[$3]::text[] end, array['unbranded']::text[]
		 from generate_series(1, $4::int) g returning id`,
		[brandId, prefix, MARKER, count],
	);
	return rows.map((r) => r.id);
}

/**
 * A realistic history graph under one prompt: two runs, each with citations,
 * one entity mention, a detection, an analysis with an observation (+aspect),
 * a filtered claim, a resolution case, a permit and two provider attempts,
 * plus the billing rows the worker would have written.
 */
async function seedHistory(brandId: string, promptId: string, runs = 2): Promise<string[]> {
	const runIds: string[] = [];
	for (let i = 0; i < runs; i++) {
		const [run] = await q<{ id: string }>(
			`insert into prompt_runs (prompt_id, brand_id, model, provider, version, web_search_enabled, raw_output, brand_mentioned, created_at)
			 values ($1, $2, 'chatgpt', 'stub', 'stub', false, '{}'::json, true, now() - ($3 || ' hours')::interval) returning id`,
			[promptId, brandId, String((i + 1) * 24)],
		);
		runIds.push(run.id);
		await q(
			`insert into citations (prompt_run_id, prompt_id, brand_id, model, url, domain, created_at, citation_index)
			 values ($1, $2, $3, 'chatgpt', 'https://example.com/a', 'example.com', now(), 1), ($1, $2, $3, 'chatgpt', 'https://example.com/b', 'example.com', now(), 2)`,
			[run.id, promptId, brandId],
		);
		const [mention] = await q<{ id: string }>(
			`insert into prompt_run_entity_mentions (prompt_run_id, brand_id, entity_type, entity_key, entity_name, detector_version)
			 values ($1, $2, 'brand', 'brand', 'Test Organization', 'it') returning id`,
			[run.id, brandId],
		);
		await q(
			`insert into sentiment_detections (prompt_run_id, brand_id, detector_version, status, mention_count) values ($1, $2, 'it', 'mentions', 1)`,
			[run.id, brandId],
		);
		const [analysis] = await q<{ id: string }>(
			`insert into sentiment_analyses (prompt_run_id, brand_id, classifier_version, taxonomy_version, status) values ($1, $2, 'it', 'it', 'completed') returning id`,
			[run.id, brandId],
		);
		const [obs] = await q<{ id: string }>(
			`insert into sentiment_observations (analysis_id, mention_id, prompt_run_id, brand_id, entity_type, entity_key, score, category, confidence, evidence)
			 values ($1, $2, $3, $4, 'brand', 'brand', 70, 'positive', 0.9, '[]'::jsonb) returning id`,
			[analysis.id, mention.id, run.id, brandId],
		);
		await q(
			`insert into sentiment_aspect_observations (observation_id, taxonomy_version, aspect_key, aspect_label, score, category, confidence, evidence)
			 values ($1, 'it', 'price', 'Price', 70, 'positive', 0.9, '[]'::jsonb)`,
			[obs.id],
		);
		await q(
			`insert into sentiment_filtered_claims (analysis_id, entity_type, entity_key, aspect_key, validation_code, classifier_version, anchor_ids)
			 values ($1, 'brand', 'brand', 'service', 'aspect-ungrounded', 'it', '[]'::jsonb)`,
			[analysis.id],
		);
		await q(
			`insert into sentiment_resolution_cases (analysis_id, instance_id, input_hash, status) values ($1, gen_random_uuid(), 'h', 'resolved')`,
			[analysis.id],
		);
		const [permit] = await q<{ id: string }>(
			`insert into sentiment_dispatch_permits (purpose, prompt_run_id, analysis_id, instance_id, input_hash, classifier_version, provider, model, phase_budget, estimated_cost_budget_usd, expires_at, issued_by, reason, correlation_id, state)
			 values ('canary', $1, $2, gen_random_uuid(), 'h', 'it', 'openrouter', 'm', '{"classify":1}'::jsonb, 0.05, now() - interval '1 hour', 'it', 'it', 'it', 'exhausted') returning id`,
			[run.id, analysis.id],
		);
		await q(
			`insert into sentiment_provider_attempts (analysis_id, instance_id, ordinal, phase, provider, model, input_hash, outcome, actual_cost_usd, permit_id)
			 values ($1, gen_random_uuid(), 1, 'classify', 'openrouter', 'm', 'h', 'accepted', 0.010, $2), ($1, gen_random_uuid(), 2, 'verify', 'openrouter', 'm', 'h', 'accepted', 0.005, $2)`,
			[analysis.id, permit.id],
		);
		await q(
			`insert into usage_events (organization_id, brand_id, prompt_id, event_type, provider, model, units, estimated_cost_usd)
			 values ($1, $2, $3, 'prompt_run', 'stub', 'chatgpt', 1, 0.005), ($1, $2, $3, 'sentiment_classification', 'openrouter', 'm', 1, 0.015)`,
			[ORG, brandId, promptId],
		);
	}
	return runIds;
}

async function chainJob(promptId: string, state = "created") {
	await q(
		`insert into pgboss.job (name, data, singleton_key, retry_limit, expire_seconds, state, start_after)
		 values ('process-prompt', jsonb_build_object('promptId', $1::text), 'prompt-' || $1::text, 0, 5400, ($2::text)::pgboss.job_state, now() + interval '1 hour')`,
		[promptId, state],
	);
}

const historyTables = [
	"prompt_runs",
	"citations",
	"prompt_run_entity_mentions",
	"sentiment_detections",
	"sentiment_analyses",
	"sentiment_observations",
	"sentiment_aspect_observations",
	"sentiment_filtered_claims",
	"sentiment_resolution_cases",
	"sentiment_dispatch_permits",
	"sentiment_provider_attempts",
];

async function historyFor(promptIds: string[]) {
	const out: Record<string, number> = {};
	for (const t of historyTables) {
		const via =
			t === "prompt_runs" || t === "citations"
				? `prompt_id = any($1::uuid[])`
				: t === "sentiment_aspect_observations"
					? `observation_id in (select id from sentiment_observations where prompt_run_id in (select id from prompt_runs where prompt_id = any($1::uuid[])))`
					: t === "sentiment_filtered_claims" ||
							t === "sentiment_resolution_cases" ||
							t === "sentiment_dispatch_permits" ||
							t === "sentiment_provider_attempts"
						? `analysis_id in (select id from sentiment_analyses where prompt_run_id in (select id from prompt_runs where prompt_id = any($1::uuid[])))`
						: `prompt_run_id in (select id from prompt_runs where prompt_id = any($1::uuid[]))`;
		out[t] = await n(`select count(*)::text as n from ${t} where ${via}`, [promptIds]);
	}
	return out;
}

async function cleanup() {
	const ids = (
		await q<{ id: string }>(`select id from prompts where $1 = any(tags) or value like 'BULK %'`, [MARKER])
	).map((r) => r.id);
	if (ids.length === 0) return;
	await q(`delete from pgboss.job where name = 'process-prompt' and data->>'promptId' = any($1::text[])`, [ids]);
	await q(
		`delete from pgboss.job where name = 'classify-sentiment' and data->>'promptRunId' in (select id::text from prompt_runs where prompt_id = any($1::uuid[]))`,
		[ids],
	);
	await q(`delete from citations where prompt_id = any($1::uuid[])`, [ids]);
	await q(`delete from prompt_runs where prompt_id = any($1::uuid[])`, [ids]);
	await q(`delete from usage_events where prompt_id = any($1::uuid[])`, [ids]);
	await q(`delete from prompts where id = any($1::uuid[])`, [ids]);
}

async function code(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as { code?: string }).code ?? String(e);
	}
}

beforeAll(async () => {
	const host = new URL(DATABASE_URL).hostname;
	if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`refusing non-loopback database ${host}`);
	await client.connect();
	const rows = await q(`select id from brands where id = any($1::text[])`, [[BRAND, NIKE]]);
	if (rows.length !== 2) throw new Error("seeded fixtures missing — not the disposable test database");
	const boss = await getBoss();
	await boss.createQueue("classify-sentiment");
	await cleanup();
}, 60_000);
afterEach(cleanup);
afterAll(async () => {
	await q("drop trigger if exists pmt10k_bulk_fault on citations");
	await q("drop function if exists pmt10k_bulk_fault()");
	await client.end();
});

describe("selection", () => {
	it("returns the exact ids of the filter, capped, and never another brand's", async () => {
		const mine = await seedPrompts(BRAND, 30, "BULK sel");
		const theirs = await seedPrompts(NIKE, 5, "BULK sel");
		const all = await bulk.listPromptIds(BRAND, query({ tag: MARKER }));
		expect(all.total).toBe(30);
		expect(new Set(all.ids)).toEqual(new Set(mine));
		expect(all.ids.some((id) => theirs.includes(id))).toBe(false);
		const disabled = await bulk.listPromptIds(BRAND, query({ tag: MARKER, status: "disabled" }));
		expect(disabled.total).toBe(15);
		const topic = await bulk.listPromptIds(BRAND, query({ tag: "bulk-topic" }));
		expect(topic.total).toBe(10);
		expect(MAX_BULK_SELECTION).toBe(10_000);
	});
});

describe("bulk status", () => {
	it("previews exact counts, flips only the rows not yet in the target state, cancels chains on disable and is idempotent", async () => {
		const brand = await loadBrand(BRAND);
		const ids = await seedPrompts(BRAND, 20, "BULK status");
		const enabled = (
			await q<{ id: string }>(`select id from prompts where id = any($1::uuid[]) and enabled`, [ids])
		).map((r) => r.id);
		for (const id of enabled) await chainJob(id);

		const preview = await bulk.previewBulkStatus(brand, ids, false);
		expect(preview).toMatchObject({
			selected: 20,
			alreadyInState: 10,
			changing: 10,
			unknown: 0,
			queuedJobs: 10,
			activeJobs: 0,
		});

		const result = await bulk.commitBulkStatus(brand, ids, false);
		expect(result).toMatchObject({ changed: 10, cancelledJobs: 10, activeJobs: 0, enabledIds: [] });
		expect(await n(`select count(*)::text as n from prompts where id = any($1::uuid[]) and enabled`, [ids])).toBe(0);
		expect(
			await n(
				`select count(*)::text as n from pgboss.job where name='process-prompt' and state in ('created','retry','active') and data->>'promptId' = any($1::text[])`,
				[ids],
			),
		).toBe(0);
		expect(
			await n(
				`select count(*)::text as n from pgboss.job where name='process-prompt' and state = 'cancelled' and data->>'promptId' = any($1::text[])`,
				[ids],
			),
		).toBe(10);

		expect(await bulk.commitBulkStatus(brand, ids, false)).toMatchObject({ changed: 0, cancelledJobs: 0 });

		const on = await bulk.commitBulkStatus(brand, ids, true);
		expect(on.changed).toBe(20);
		expect(on.enabledIds).toHaveLength(20);
		await scheduleFirstPromptRuns(on.enabledIds);
		const jobs = await q<{ prompt_id: string; start_after: Date }>(
			`select data->>'promptId' as prompt_id, start_after from pgboss.job where name='process-prompt' and state='created' and data->>'promptId' = any($1::text[])`,
			[ids],
		);
		expect(jobs).toHaveLength(20);
		expect(new Set(jobs.map((j) => j.prompt_id)).size).toBe(20);
		expect(new Set(jobs.map((j) => j.start_after.getTime())).size).toBeGreaterThan(15);
		// Repeating the enable is a no-op and starts no second chain.
		const again = await bulk.commitBulkStatus(brand, ids, true);
		expect(again.changed).toBe(0);
		await scheduleFirstPromptRuns(ids);
		expect(
			await n(
				`select count(*)::text as n from pgboss.job where name='process-prompt' and state='created' and data->>'promptId' = any($1::text[])`,
				[ids],
			),
		).toBe(20);
	}, 60_000);

	/**
	 * Enable starts the chains after the commit, off the request. This forces
	 * the worst ordering: the chain start has already decided to send when the
	 * disable of the same prompt begins. Either the disable waits for the
	 * insert and cancels it, or it lands first and the send sees the prompt
	 * disabled — but a queued chain for a disabled prompt must never remain.
	 */
	it("leaves no queued chain when a disable lands between the chain start's check and its send", async () => {
		const brand = await loadBrand(BRAND);
		const [id] = await seedPrompts(BRAND, 1, "BULK race");
		await q(`update prompts set enabled = false where id = $1`, [id]);
		const on = await bulk.commitBulkStatus(brand, [id], true);
		expect(on.enabledIds).toEqual([id]);

		const boss = await getBoss();
		const realSend = boss.send.bind(boss);
		let disable: Promise<unknown> | null = null;
		const sendSpy = vi.spyOn(boss, "send").mockImplementation(async (...args: Parameters<typeof boss.send>) => {
			if (!disable) {
				disable = bulk.commitBulkStatus(brand, [id], false);
				// Continue only once the disable has either finished or is blocked on
				// a lock held by this chain start — both are stable, observable states.
				let settled = false;
				disable.finally(() => {
					settled = true;
				});
				await expect
					.poll(
						async () =>
							settled ||
							(await n(
								`select count(*)::text as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%prompts%'`,
							)) > 0,
						{ timeout: 10_000, interval: 25 },
					)
					.toBe(true);
			}
			return realSend(...args);
		});
		try {
			await scheduleFirstPromptRuns([id]);
			expect(sendSpy).toHaveBeenCalled();
			await disable;
		} finally {
			sendSpy.mockRestore();
		}

		expect((await q<{ enabled: boolean }>(`select enabled from prompts where id = $1`, [id]))[0].enabled).toBe(false);
		const byState = Object.fromEntries(
			(
				await q<{ state: string; n: string }>(
					`select state::text, count(*)::text as n from pgboss.job where name='process-prompt' and data->>'promptId' = $1 group by state`,
					[id],
				)
			).map((r) => [r.state, Number(r.n)]),
		);
		// The disable waited for the insert and cancelled it: one cancelled job, nothing queued.
		expect(byState).toEqual({ cancelled: 1 });
	}, 30_000);

	it("refuses a selection with a foreign id without touching anything", async () => {
		const brand = await loadBrand(BRAND);
		const ids = await seedPrompts(BRAND, 4, "BULK foreign");
		const [theirs] = await seedPrompts(NIKE, 1, "BULK foreign");
		expect(await code(bulk.commitBulkStatus(brand, [...ids, theirs], false))).toBe("bulk-status-stale");
		expect(await n(`select count(*)::text as n from prompts where id = any($1::uuid[]) and enabled`, [ids])).toBe(2);
		expect((await q<{ enabled: boolean }>(`select enabled from prompts where id = $1`, [theirs]))[0].enabled).toBe(
			false,
		);
	});
});

describe("delete", () => {
	it("removes the prompts with their whole history, keeps billing and the control log, cancels queued chains", async () => {
		const brand = await loadBrand(BRAND);
		const ids = await seedPrompts(BRAND, 6, "BULK del");
		await q(`update prompts set enabled = false where id = any($1::uuid[])`, [ids]);
		for (const id of ids.slice(0, 3)) await seedHistory(BRAND, id, 2);
		await chainJob(ids[0]);
		const keep = await seedPrompts(BRAND, 2, "BULK keep");
		await seedHistory(BRAND, keep[0], 1);
		const controlBefore = await n(`select count(*)::text as n from sentiment_control_events`);
		const usageBefore = await n(`select count(*)::text as n from usage_events where prompt_id = any($1::uuid[])`, [
			ids,
		]);
		const before = await historyFor(ids);
		expect(before.prompt_runs).toBe(6);
		expect(before.sentiment_provider_attempts).toBe(12);

		const preview = await bulk.previewDelete(brand, ids);
		expect(preview.blockers).toEqual([]);
		expect(preview.counts).toMatchObject({
			prompts: 6,
			promptRuns: 6,
			citations: 12,
			entityMentions: 6,
			sentimentDetections: 6,
			sentimentAnalyses: 6,
			sentimentObservations: 6,
			sentimentAspectObservations: 6,
			sentimentFilteredClaims: 6,
			sentimentResolutionCases: 6,
			sentimentDispatchPermits: 6,
			sentimentProviderAttempts: 12,
			promptJobsQueued: 1,
			promptJobsActive: 0,
			sentimentJobsPending: 0,
			effectivePermits: 0,
			usageEventsKept: 12,
		});
		expect(Number(preview.counts.sentimentAttemptCostUsd)).toBeCloseTo(0.09, 6);
		expect(preview.phrase).toBe("DELETE 6 PROMPTS");

		// Wrong phrase and a stale digest are refused before anything happens.
		expect(
			await code(bulk.commitDelete(brand, ids, preview.digest, "DELETE 5 PROMPTS", { actor: "it", requestId: "r" })),
		).toBe("delete-phrase");
		expect(await code(bulk.commitDelete(brand, ids, "nope", preview.phrase, { actor: "it", requestId: "r" }))).toBe(
			"delete-stale",
		);
		expect(await n(`select count(*)::text as n from prompts where id = any($1::uuid[])`, [ids])).toBe(6);

		const started = performance.now();
		const result = await bulk.commitDelete(brand, ids, preview.digest, preview.phrase, { actor: "it", requestId: "r" });
		console.log(`[bulk-delete] 6 prompts / 6 runs graph: ${(performance.now() - started).toFixed(0)} ms`);
		expect(result.counts.prompts).toBe(6);
		expect(result.cancelledJobs).toBe(1);
		expect(await n(`select count(*)::text as n from prompts where id = any($1::uuid[])`, [ids])).toBe(0);
		const after = await historyFor(ids);
		for (const t of historyTables) expect(after[t], t).toBe(0);
		expect(await n(`select count(*)::text as n from usage_events where prompt_id = any($1::uuid[])`, [ids])).toBe(
			usageBefore,
		);
		expect(await n(`select count(*)::text as n from sentiment_control_events`)).toBe(controlBefore);
		expect(
			await n(
				`select count(*)::text as n from pgboss.job where name='process-prompt' and state='cancelled' and data->>'promptId' = $1`,
				[ids[0]],
			),
		).toBe(1);
		// The neighbour prompt and its history are untouched.
		expect((await historyFor(keep)).prompt_runs).toBe(1);
		expect((await historyFor(keep)).sentiment_provider_attempts).toBe(2);
	}, 60_000);

	it("refuses enabled, foreign, actively worked or freshly changed selections as a whole", async () => {
		const brand = await loadBrand(BRAND);
		const ids = await seedPrompts(BRAND, 4, "BULK block");
		await q(`update prompts set enabled = false where id = any($1::uuid[])`, [ids]);
		const [theirs] = await seedPrompts(NIKE, 1, "BULK block");

		await q(`update prompts set enabled = true where id = $1`, [ids[0]]);
		let preview = await bulk.previewDelete(brand, [...ids, theirs]);
		expect(preview.blockers.join(" ")).toMatch(/1 selected prompt is not in this brand/);
		expect(preview.blockers.join(" ")).toMatch(/1 selected prompt is still enabled/);
		expect(
			await code(
				bulk.commitDelete(brand, [...ids, theirs], preview.digest, deletePhrase(5), { actor: "it", requestId: "r" }),
			),
		).toBe("delete-blocked");
		await q(`update prompts set enabled = false where id = $1`, [ids[0]]);

		// A pending sentiment classification for one of the runs blocks it.
		const [runId] = await seedHistory(BRAND, ids[1], 1);
		await q(
			`insert into pgboss.job (name, data, retry_limit, expire_seconds, state) values ('classify-sentiment', jsonb_build_object('promptRunId', $1::text), 0, 900, 'created')`,
			[runId],
		);
		preview = await bulk.previewDelete(brand, ids);
		expect(preview.blockers.join(" ")).toMatch(/1 sentiment classification is still queued/);
		await q(`delete from pgboss.job where name='classify-sentiment' and data->>'promptRunId' = $1`, [runId]);

		// An active prompt job blocks it.
		await chainJob(ids[2], "active");
		preview = await bulk.previewDelete(brand, ids);
		expect(preview.blockers.join(" ")).toMatch(/1 prompt job is running right now/);
		await q(`delete from pgboss.job where name='process-prompt' and data->>'promptId' = $1`, [ids[2]]);

		// A clean preview whose history then grows is stale at commit time.
		preview = await bulk.previewDelete(brand, ids);
		expect(preview.blockers).toEqual([]);
		await seedHistory(BRAND, ids[3], 1);
		expect(
			await code(bulk.commitDelete(brand, ids, preview.digest, preview.phrase, { actor: "it", requestId: "r" })),
		).toBe("delete-stale");
		expect(await n(`select count(*)::text as n from prompts where id = any($1::uuid[])`, [ids])).toBe(4);
		expect((await historyFor(ids)).prompt_runs).toBe(2);
	}, 60_000);

	it("leaves every row in place when a statement fails inside the transaction", async () => {
		const brand = await loadBrand(BRAND);
		const ids = await seedPrompts(BRAND, 3, "BULK fault");
		await q(`update prompts set enabled = false where id = any($1::uuid[])`, [ids]);
		for (const id of ids) await seedHistory(BRAND, id, 1);
		await chainJob(ids[0]);
		await q(
			`create or replace function pmt10k_bulk_fault() returns trigger as $$ begin raise exception 'injected delete fault'; end $$ language plpgsql`,
		);
		await q(
			`create trigger pmt10k_bulk_fault before delete on citations for each statement execute function pmt10k_bulk_fault()`,
		);
		try {
			const preview = await bulk.previewDelete(brand, ids);
			await expect(
				bulk.commitDelete(brand, ids, preview.digest, preview.phrase, { actor: "it", requestId: "r" }),
			).rejects.toThrow();
			expect(await n(`select count(*)::text as n from prompts where id = any($1::uuid[])`, [ids])).toBe(3);
			const after = await historyFor(ids);
			expect(after.prompt_runs).toBe(3);
			expect(after.citations).toBe(6);
			expect(after.sentiment_provider_attempts).toBe(6);
			// The chain cancellation rolled back with the rest.
			expect(
				await n(
					`select count(*)::text as n from pgboss.job where name='process-prompt' and state='created' and data->>'promptId' = $1`,
					[ids[0]],
				),
			).toBe(1);
		} finally {
			await q("drop trigger if exists pmt10k_bulk_fault on citations");
			await q("drop function if exists pmt10k_bulk_fault()");
		}
	});
});

describe("tag removal", () => {
	it("removes one user tag from every prompt of the brand and nothing else", async () => {
		const ids = await seedPrompts(BRAND, 9, "BULK tag");
		await seedHistory(BRAND, ids[2], 1);
		const theirs = await seedPrompts(NIKE, 3, "BULK tag");
		const preview = await bulk.previewTagRemoval(BRAND, "  Bulk-Topic ");
		expect(preview).toEqual({ tag: "bulk-topic", affectedPrompts: 3, phrase: "REMOVE bulk-topic" });

		expect(await code(bulk.commitTagRemoval(BRAND, "bulk-topic", "REMOVE other"))).toBe("tag-phrase");
		expect(await code(bulk.commitTagRemoval(BRAND, "unbranded", removeTagPhrase("unbranded")))).toBe("tag-system");
		expect(await code(bulk.commitTagRemoval(BRAND, "   ", "REMOVE "))).toBe("tag-empty");

		expect(await bulk.commitTagRemoval(BRAND, "bulk-topic", "REMOVE bulk-topic")).toEqual({
			tag: "bulk-topic",
			updated: 3,
		});
		expect(
			await n(`select count(*)::text as n from prompts where brand_id = $1 and 'bulk-topic' = any(tags)`, [BRAND]),
		).toBe(0);
		expect(
			await n(`select count(*)::text as n from prompts where id = any($1::uuid[]) and $2 = any(tags)`, [ids, MARKER]),
		).toBe(9);
		expect(
			await n(`select count(*)::text as n from prompts where id = any($1::uuid[]) and 'unbranded' = any(system_tags)`, [
				ids,
			]),
		).toBe(9);
		expect(await n(`select count(*)::text as n from prompts where id = any($1::uuid[])`, [ids])).toBe(9);
		expect((await historyFor([ids[2]])).sentiment_analyses).toBe(1);
		// The other tenant's identical tag is untouched; repeating is a no-op.
		expect(
			await n(`select count(*)::text as n from prompts where id = any($1::uuid[]) and 'bulk-topic' = any(tags)`, [
				theirs,
			]),
		).toBe(1);
		expect(await bulk.commitTagRemoval(BRAND, "bulk-topic", "REMOVE bulk-topic")).toEqual({
			tag: "bulk-topic",
			updated: 0,
		});
	});
});
