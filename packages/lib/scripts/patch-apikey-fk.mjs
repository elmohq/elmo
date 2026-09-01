/**
 * Restore the `apikey.referenceId -> organization.id` foreign key on the
 * generated auth schema.
 *
 * `references: "organization"` is a runtime option of the api-key plugin, so
 * the better-auth CLI cannot see it and emits a bare text column. The cascade
 * is what makes a deleted organization take its keys with it; without it a
 * removed tenant's keys keep resolving to an id nothing answers for.
 *
 * Matched loosely on purpose — only the column name and its table — so a change
 * to the generator's formatting doesn't break the patch. If the shape moves far
 * enough that this can't find it, it exits non-zero rather than silently
 * emitting a schema missing a constraint.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [path] = process.argv.slice(2);
if (!path) {
	console.error("usage: patch-apikey-fk.mjs <schema-file>");
	process.exit(1);
}

const source = readFileSync(path, "utf8");

/** The apikey table's own body, so `subscription.referenceId` is never touched. */
const table = source.match(/export const apikey = pgTable\([\s\S]*?^\);$/m);
if (!table) {
	console.error("[patch-apikey-fk] the apikey table is not where this expected it");
	process.exit(1);
}

if (table[0].includes("organization.id")) process.exit(0);

const column = /(referenceId:\s*text\("reference_id"\))(\s*\.notNull\(\))?(\s*,)/;
if (!column.test(table[0])) {
	console.error("[patch-apikey-fk] apikey.referenceId is not in the shape this expected");
	process.exit(1);
}

const patched = table[0].replace(column, '$1.notNull().references(() => organization.id, { onDelete: "cascade" })$3');
writeFileSync(path, source.slice(0, table.index) + patched + source.slice(table.index + table[0].length));
