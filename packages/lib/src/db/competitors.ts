import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { bucketSql } from "../rollups/bucket";
import type { DbConnection } from "./db-connection";
import { brands, competitors } from "./schema";

export interface CompetitorFields {
	name: string;
	domains: string[];
	aliases: string[];
}

/** One competitor as a save submits it: `id` for one already tracked, absent for one being added. */
export interface SubmittedCompetitor extends CompetitorFields {
	id?: string;
}

export interface StoredCompetitor extends CompetitorFields {
	id: string;
}

export interface CompetitorSavePlan {
	inserts: CompetitorFields[];
	updates: StoredCompetitor[];
	deletes: string[];
	/** Old name to new, for each competitor the save renames. */
	renames: Map<string, string>;
}

/** Oldest first, so a saved list comes back in the order it was built up. */
export const competitorOrder = [asc(competitors.createdAt), asc(competitors.name), asc(competitors.id)];

const nameKey = (name: string) => name.trim().toLowerCase();

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

type Matches = Map<SubmittedCompetitor, StoredCompetitor>;

function assertDistinctNames(submitted: SubmittedCompetitor[]): void {
	const seen = new Set<string>();
	for (const entry of submitted) {
		if (seen.has(nameKey(entry.name))) {
			throw new Error(`Two competitors are named "${entry.name}"; give each its own name`);
		}
		seen.add(nameKey(entry.name));
	}
}

function matchByIds(stored: StoredCompetitor[], submitted: SubmittedCompetitor[], matched: Matches): void {
	const byId = new Map(stored.map((row) => [row.id, row]));
	const claimed = new Set<string>();
	for (const entry of submitted) {
		if (entry.id === undefined) continue;
		const row = byId.get(entry.id);
		if (!row) throw new Error(`"${entry.name}" is no longer tracked; reload to see the current competitors`);
		if (claimed.has(row.id)) throw new Error(`"${entry.name}" was submitted twice`);
		claimed.add(row.id);
		matched.set(entry, row);
	}
}

/** Gives each entry still unmatched the one row `pick` finds for it, unless another entry wants that row too. */
function matchUnambiguously(
	stored: StoredCompetitor[],
	submitted: SubmittedCompetitor[],
	matched: Matches,
	pick: (entry: SubmittedCompetitor, row: StoredCompetitor) => boolean,
): void {
	const claimed = new Set(matched.values());
	const rows = stored.filter((row) => !claimed.has(row));
	const picks = new Map<SubmittedCompetitor, StoredCompetitor>();
	const wanted = new Map<StoredCompetitor, number>();
	for (const entry of submitted.filter((entry) => !matched.has(entry))) {
		const candidates = rows.filter((row) => pick(entry, row));
		if (candidates.length !== 1) continue;
		picks.set(entry, candidates[0]);
		wanted.set(candidates[0], (wanted.get(candidates[0]) ?? 0) + 1);
	}
	for (const [entry, row] of picks) if (wanted.get(row) === 1) matched.set(entry, row);
}

/**
 * Matches a submitted roster to the stored one, so a competitor keeps its row (and its id) across
 * saves. An entry without an id, from a caller that predates ids, takes the stored competitor with
 * its name, else the one stored competitor it shares a domain with: either way a save that changes
 * one field of a competitor updates it rather than replacing it. A match that's ambiguous isn't
 * guessed at; the entry is added as new.
 */
export function planCompetitorSave(stored: StoredCompetitor[], submitted: SubmittedCompetitor[]): CompetitorSavePlan {
	assertDistinctNames(submitted);
	const matched: Matches = new Map();
	matchByIds(stored, submitted, matched);
	matchUnambiguously(stored, submitted, matched, (entry, row) => nameKey(row.name) === nameKey(entry.name));
	matchUnambiguously(stored, submitted, matched, (entry, row) => row.domains.some((d) => entry.domains.includes(d)));

	const plan: CompetitorSavePlan = { inserts: [], updates: [], deletes: [], renames: new Map() };
	for (const entry of submitted) {
		const row = matched.get(entry);
		const fields = { name: entry.name, domains: entry.domains, aliases: entry.aliases };
		if (!row) {
			plan.inserts.push(fields);
			continue;
		}
		if (row.name !== entry.name) plan.renames.set(row.name, entry.name);
		if (row.name !== entry.name || !sameList(row.domains, entry.domains) || !sameList(row.aliases, entry.aliases)) {
			plan.updates.push({ id: row.id, ...fields });
		}
	}
	const kept = new Set(matched.values());
	plan.deletes = stored.filter((row) => !kept.has(row)).map((row) => row.id);
	return plan;
}

/**
 * Moves a brand's name-keyed history (each run's mentions and assessments) onto competitors' new
 * names, and marks the rollups built from it for a rebuild. All renames move at once, so two
 * competitors can swap names. Assessments keep the fingerprint they were judged under, so the
 * replay a rename triggers re-judges the renamed competitors within its window, as any change to
 * what is matched or asked does; history outside the window keeps its judgements.
 */
export async function moveCompetitorHistory(
	conn: DbConnection,
	brandId: string,
	renames: Map<string, string>,
): Promise<number> {
	if (renames.size === 0) return 0;
	const map = JSON.stringify(Object.fromEntries(renames));
	// On a clash with a key the run already has, the renamed competitor's entry wins.
	const renamedKeys = (object: SQL) => sql`(
		SELECT coalesce(jsonb_object_agg(coalesce(r.map ->> e.key, e.key), e.value ORDER BY r.map ? e.key), '{}'::jsonb)
		FROM jsonb_each(${object}) e
	)`;
	const result = await conn.execute(sql`
		WITH r AS (SELECT ${map}::jsonb AS map),
		moved AS (
			UPDATE run_mentions m
			SET
				competitors_mentioned = ARRAY(
					SELECT s.name FROM (
						SELECT DISTINCT ON (coalesce(r.map ->> t.name, t.name)) coalesce(r.map ->> t.name, t.name) AS name, t.i
						FROM unnest(m.competitors_mentioned) WITH ORDINALITY AS t(name, i)
						ORDER BY coalesce(r.map ->> t.name, t.name), t.i
					) s
					ORDER BY s.i
				),
				assessments = CASE
					WHEN jsonb_typeof(m.assessments -> 'competitors') = 'object'
						AND jsonb_typeof(m.assessments -> 'judged' -> 'competitors') = 'object'
					THEN jsonb_set(
						jsonb_set(m.assessments, '{competitors}', ${renamedKeys(sql`m.assessments -> 'competitors'`)}),
						'{judged,competitors}',
						${renamedKeys(sql`m.assessments -> 'judged' -> 'competitors'`)}
					)
					ELSE m.assessments
				END
			FROM r, prompt_runs p
			WHERE p.id = m.run_id
				-- By prompt, which the runs are indexed on.
				AND p.prompt_id IN (SELECT id FROM prompts WHERE brand_id = ${brandId})
				AND (
					m.competitors_mentioned && ARRAY(SELECT jsonb_object_keys(r.map))
					OR m.assessments -> 'competitors' ?| ARRAY(SELECT jsonb_object_keys(r.map))
					OR m.assessments -> 'judged' -> 'competitors' ?| ARRAY(SELECT jsonb_object_keys(r.map))
				)
			RETURNING p.created_at
		)
		INSERT INTO rollup_dirty (brand_id, bucket)
		SELECT DISTINCT ${brandId}, ${bucketSql(sql`created_at`)} FROM moved
		ON CONFLICT (brand_id, bucket) DO UPDATE SET first_marked_at = rollup_dirty.first_marked_at
	`);
	return result.rowCount ?? 0;
}

/**
 * Saves a brand's whole roster in place: what's submitted is what the brand ends up with, but a
 * competitor that stays keeps its id, and one that's renamed takes its history with it.
 */
export async function saveCompetitors(
	conn: DbConnection,
	brandId: string,
	submitted: SubmittedCompetitor[],
): Promise<(typeof competitors.$inferSelect)[]> {
	// Two saves at once would otherwise both plan against the same rows.
	await conn.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).for("update");
	const stored = await conn
		.select({ id: competitors.id, name: competitors.name, domains: competitors.domains, aliases: competitors.aliases })
		.from(competitors)
		.where(eq(competitors.brandId, brandId))
		.orderBy(...competitorOrder);
	const plan = planCompetitorSave(stored, submitted);

	if (plan.deletes.length > 0) {
		await conn.delete(competitors).where(and(eq(competitors.brandId, brandId), inArray(competitors.id, plan.deletes)));
	}
	for (const { id, ...fields } of plan.updates) {
		await conn
			.update(competitors)
			.set({ ...fields, updatedAt: new Date() })
			.where(eq(competitors.id, id));
	}
	if (plan.inserts.length > 0) {
		// A millisecond apart, so competitors added together keep the order they were listed in.
		const now = Date.now();
		await conn
			.insert(competitors)
			.values(plan.inserts.map((fields, i) => ({ brandId, ...fields, createdAt: new Date(now + i) })));
	}
	await moveCompetitorHistory(conn, brandId, plan.renames);

	return conn.query.competitors.findMany({ where: eq(competitors.brandId, brandId), orderBy: competitorOrder });
}
