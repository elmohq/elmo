/**
 * `references: "organization"` is a runtime option the better-auth CLI cannot
 * see, so it emits a bare text column and the cascade is lost. Exits non-zero
 * rather than emitting a schema missing the constraint.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [path] = process.argv.slice(2);
if (!path) {
	console.error("usage: patch-apikey-fk.mjs <schema-file>");
	process.exit(1);
}

const source = readFileSync(path, "utf8");

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
