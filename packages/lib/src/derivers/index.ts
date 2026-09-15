import { createHash } from "node:crypto";
import type { Brand, Competitor } from "../db/schema";
import { mentionsDeriver } from "./mentions";
import type { BrandContext, DerivedColumns, Deriver, DeriverInput } from "./types";

export { mentionsDeriver } from "./mentions";
export type { RowWorkPlan, StoredRunVersions } from "./reprocess-plan";
export { planRowWork } from "./reprocess-plan";
export type { BrandContext, DerivedColumns, Deriver, DeriverInput } from "./types";

export const DERIVERS: readonly Deriver[] = [mentionsDeriver];

/**
 * What a stored row is compared against: the deriver's code version and the
 * configuration it read. Sixteen hex characters is far past the point where a
 * collision between two configurations of one brand is plausible, and it keeps
 * the stamp readable in `analysis_versions`.
 */
export function versionStamp(deriver: Deriver, ctx: BrandContext): string {
	const digest = createHash("sha256").update(deriver.fingerprint(ctx)).digest("hex");
	return `${deriver.version}:${digest.slice(0, 16)}`;
}

export function currentVersions(ctx: BrandContext, derivers: readonly Deriver[] = DERIVERS): Record<string, string> {
	return Object.fromEntries(derivers.map((deriver) => [deriver.name, versionStamp(deriver, ctx)]));
}

export function staleDerivers(
	stored: Record<string, string>,
	ctx: BrandContext,
	derivers: readonly Deriver[] = DERIVERS,
	only?: string[],
): Deriver[] {
	return derivers.filter(
		(deriver) => (!only || only.includes(deriver.name)) && stored[deriver.name] !== versionStamp(deriver, ctx),
	);
}

export function deriveAll(
	input: DeriverInput,
	ctx: BrandContext,
	derivers: readonly Deriver[] = DERIVERS,
): { columns: DerivedColumns; versions: Record<string, string> } {
	const columns: DerivedColumns = {};
	const versions: Record<string, string> = {};
	for (const deriver of derivers) {
		Object.assign(columns, deriver.derive(input, ctx));
		versions[deriver.name] = versionStamp(deriver, ctx);
	}
	return { columns, versions };
}

export function brandContextFrom(brand: Brand, competitors: Competitor[]): BrandContext {
	return {
		brand: {
			name: brand.name,
			aliases: brand.aliases ?? [],
			website: brand.website,
			additionalDomains: brand.additionalDomains ?? [],
		},
		competitors: competitors.map((competitor) => ({
			name: competitor.name,
			aliases: competitor.aliases ?? [],
			domains: competitor.domains ?? [],
		})),
	};
}
