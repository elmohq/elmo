import semver from "semver";
import type { Migration, MigrationContext } from "./types.js";

export function planMigrations(from: string, to: string, all: readonly Migration[]): Migration[] {
	if (!semver.valid(from)) {
		throw new Error(`Invalid from version: ${from}`);
	}
	if (!semver.valid(to)) {
		throw new Error(`Invalid to version: ${to}`);
	}
	if (semver.gt(from, to)) {
		throw new Error(`Downgrade not supported: ${from} -> ${to}`);
	}
	if (semver.eq(from, to)) {
		return [];
	}

	for (const m of all) {
		if (!semver.valid(m.from)) {
			throw new Error(`Migration has invalid from: ${m.from}`);
		}
		if (!semver.valid(m.to)) {
			throw new Error(`Migration has invalid to: ${m.to}`);
		}
		if (!semver.gt(m.to, m.from)) {
			throw new Error(`Migration ${m.from} -> ${m.to}: 'to' must be greater than 'from'`);
		}
	}

	const applicable = all
		.filter((m) => semver.gte(m.from, from) && semver.lt(m.from, to))
		.slice()
		.sort((a, b) => semver.compare(a.from, b.from));

	const seen = new Set<string>();
	for (const m of applicable) {
		if (seen.has(m.from)) {
			throw new Error(`Multiple migrations registered with from=${m.from}`);
		}
		seen.add(m.from);
	}

	return applicable;
}

export async function runMigrations(plan: readonly Migration[], ctx: MigrationContext): Promise<void> {
	for (const migration of plan) {
		ctx.log.step(`Migrating ${migration.from} → ${migration.to}: ${migration.description}`);
		await migration.run(ctx);
	}
}
