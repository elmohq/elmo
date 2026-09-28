import { createHash } from "node:crypto";
import { type PromptImportSummary, planPromptImport } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { promptIdentityKeySql } from "@workspace/lib/db/prompt-identity";
import { type Brand, prompts } from "@workspace/lib/db/schema";
import { assertCanAddPrompts, lockBrandPrompts, reserveBrandPromptCapacity } from "@workspace/lib/entitlements";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { count, eq, max } from "drizzle-orm";
import { PublicError } from "@/lib/public-errors";

/**
 * Upper bound on one import's text. Ten thousand lines of realistic prompts
 * with tags are about 1 MB; twice that leaves room for long prompts while a
 * runaway paste is refused before it is parsed.
 */
export const MAX_IMPORT_TEXT_CHARS = 2_000_000;

/** Rows per INSERT statement inside the one import transaction. */
const IMPORT_INSERT_CHUNK = 500;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;

export interface PromptImportReview {
	summary: PromptImportSummary;
	/** Status the new prompts will get. Off by default: importing is not yet tracking. */
	enabled: boolean;
	/** Brand rows before the import and how many more the cap allows. */
	brandTotal: number;
	room: number;
	/** Opaque proof of what was reviewed; Commit refuses anything else. */
	token: string;
}

export interface PromptImportCommitResult {
	inserted: number;
	enabled: boolean;
	insertedIds: string[];
}

/**
 * The state of the brand's catalog the review was computed against: the
 * count and the latest write. Any insert, update or delete in the brand moves
 * one of them, so a Commit that recomputes it can tell the review is stale.
 */
async function catalogFingerprint(executor: Executor, brandId: string): Promise<string> {
	const [row] = await executor
		.select({ total: count(), updated: max(prompts.updatedAt), created: max(prompts.createdAt) })
		.from(prompts)
		.where(eq(prompts.brandId, brandId));
	return `${row?.total ?? 0}|${row?.updated?.toISOString() ?? ""}|${row?.created?.toISOString() ?? ""}`;
}

async function existingIdentityKeys(executor: Executor, brandId: string): Promise<Set<string>> {
	const rows = await executor.select({ key: promptIdentityKeySql() }).from(prompts).where(eq(prompts.brandId, brandId));
	return new Set(rows.map((row) => row.key));
}

function reviewToken(input: {
	brandId: string;
	text: string;
	enabled: boolean;
	fingerprint: string;
	summary: PromptImportSummary;
}): string {
	const { samples: _samples, ...counts } = input.summary;
	return createHash("sha256")
		.update(input.brandId)
		.update("\u0000")
		.update(String(input.enabled))
		.update("\u0000")
		.update(input.fingerprint)
		.update("\u0000")
		.update(JSON.stringify(counts))
		.update("\u0000")
		.update(input.text)
		.digest("base64url");
}

function assertTextWithinLimit(text: string): void {
	if (text.length > MAX_IMPORT_TEXT_CHARS) {
		throw new PublicError(
			"import-too-large",
			`This paste is ${text.length.toLocaleString("en-US")} characters; an import may hold at most ${MAX_IMPORT_TEXT_CHARS.toLocaleString("en-US")}. Split it and import in parts.`,
		);
	}
}

async function planAgainst(executor: Executor, brandId: string, text: string, enabled: boolean) {
	const [fingerprint, existingKeys, [countRow]] = await Promise.all([
		catalogFingerprint(executor, brandId),
		existingIdentityKeys(executor, brandId),
		executor.select({ total: count() }).from(prompts).where(eq(prompts.brandId, brandId)),
	]);
	const brandTotal = countRow?.total ?? 0;
	const room = Math.max(0, MAX_PROMPTS - brandTotal);
	const plan = planPromptImport(text, { existingKeys, room });
	const token = reviewToken({ brandId, text, enabled, fingerprint, summary: plan.summary });
	return { plan, brandTotal, room, token };
}

/**
 * Review: what a Commit of this text would do right now. Reads only; the
 * text stays in the browser.
 */
export async function reviewPromptImport(brandId: string, text: string, enabled: boolean): Promise<PromptImportReview> {
	assertTextWithinLimit(text);
	const { plan, brandTotal, room, token } = await planAgainst(db, brandId, text, enabled);
	return { summary: plan.summary, enabled, brandTotal, room, token };
}

/**
 * Commit: the reviewed import, or nothing. The text is re-planned under the
 * brand's insert lock and must reproduce the review's token — same text,
 * same status, same catalog — otherwise the review is stale and nothing is
 * written. Lines that would block (over capacity, no prompt text) refuse the
 * whole import, as the paste always has. The inserts run in chunks inside
 * the one transaction, so a failure anywhere leaves zero new rows.
 */
export async function commitPromptImport(
	brand: Brand,
	text: string,
	enabled: boolean,
	token: string,
): Promise<PromptImportCommitResult> {
	assertTextWithinLimit(text);

	return db.transaction(async (tx) => {
		await lockBrandPrompts(tx, brand.id);
		const { plan, token: current } = await planAgainst(tx, brand.id, text, enabled);
		if (current !== token) {
			throw new PublicError(
				"import-review-stale",
				"The prompt list or the text changed since this review. Review the import again before committing.",
			);
		}
		const { summary } = plan;
		if (summary.missingPrompt > 0) {
			throw new PublicError("import-missing-prompt", "Some lines have tags but no prompt text. Fix or remove them.");
		}
		if (summary.overCapacity > 0) {
			throw new PublicError(
				"import-over-capacity",
				`This import is ${summary.overCapacity.toLocaleString("en-US")} prompt${summary.overCapacity === 1 ? "" : "s"} over the ${MAX_PROMPTS.toLocaleString("en-US")} limit. Remove some lines to continue.`,
			);
		}
		if (plan.records.length === 0) {
			throw new PublicError("import-empty", "Nothing to import: every line is blank or already in the list.");
		}

		await reserveBrandPromptCapacity(tx, brand.id, plan.records.length);
		if (enabled) await assertCanAddPrompts(brand.organizationId, plan.records.length);

		const insertedIds: string[] = [];
		for (let i = 0; i < plan.records.length; i += IMPORT_INSERT_CHUNK) {
			const rows = await tx
				.insert(prompts)
				.values(
					plan.records.slice(i, i + IMPORT_INSERT_CHUNK).map((record) => ({
						brandId: brand.id,
						value: record.value,
						enabled,
						tags: record.tags,
						systemTags: computeSystemTags(record.value, brand.name, brand.website),
					})),
				)
				.returning({ id: prompts.id });
			for (const row of rows) insertedIds.push(row.id);
		}

		return { inserted: insertedIds.length, enabled, insertedIds };
	});
}
