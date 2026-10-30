import { sql } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { brandDataVersions } from "../db/schema";

export const PAGE_ID_RANGE = 200_000;

export const monthKey = (date: Date) => `month:${date.toISOString().slice(0, 7)}`;
export const pageRangeKey = (pageId: number) => `pages:${Math.floor(pageId / PAGE_ID_RANGE)}`;

async function bump(tx: DbConnection, brandId: string, keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	await tx.execute(sql`
		INSERT INTO ${brandDataVersions} (brand_id, chunk_id, version)
		SELECT ${brandId}, key, (extract(epoch FROM clock_timestamp()) * 1000)::bigint
		FROM unnest(ARRAY[${sql.join(
			keys.map((key) => sql`${key}`),
			sql`, `,
		)}]::text[]) AS key
		WHERE EXISTS (SELECT 1 FROM brands WHERE id = ${brandId})
		ON CONFLICT (brand_id, chunk_id) DO UPDATE
		SET version = GREATEST(${brandDataVersions.version} + 1, excluded.version)
	`);
}

/** Every UTC month `[from, toExclusive)` touches. */
export function monthsBetween(from: Date, toExclusive: Date): string[] {
	const keys: string[] = [];
	const month = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
	while (month < toExclusive) {
		keys.push(monthKey(month));
		month.setUTCMonth(month.getUTCMonth() + 1);
	}
	return keys;
}

export function bumpMonths(tx: DbConnection, brandId: string, from: Date, toExclusive: Date): Promise<void> {
	return bump(tx, brandId, monthsBetween(from, toExclusive));
}

export async function bumpPageRanges(tx: DbConnection, pages: { brandId: string; pageId: number }[]): Promise<void> {
	const byBrand = new Map<string, Set<string>>();
	for (const { brandId, pageId } of pages) {
		const keys = byBrand.get(brandId) ?? new Set();
		keys.add(pageRangeKey(pageId));
		byBrand.set(brandId, keys);
	}
	for (const [brandId, keys] of byBrand) await bump(tx, brandId, [...keys]);
}
