// Lists English strings passed to t()/tn()/translate() that have no French
// entry, and French entries no longer used. Run: node scripts/check-i18n.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../src");
const files = fs
	.readdirSync(root, { recursive: true })
	.filter((f) => /\.(tsx?|mts)$/.test(f) && !/stories|__tests__|\.test\./.test(f))
	.map((f) => path.join(root, f));

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const patterns = [
	new RegExp(String.raw`\bt\(\s*${STR}`, "g"),
	new RegExp(String.raw`\btn\(\s*[^,]+,\s*${STR},\s*${STR}`, "g"),
	new RegExp(String.raw`\btranslate(?:Plural)?\(\s*\w+,\s*(?:[^,"]+,\s*)?${STR}(?:,\s*${STR})?`, "g"),
	new RegExp(String.raw`\?\? "en",\s*${STR}`, "g"),
	new RegExp(String.raw`\bt\([^"()]+\?\?\s*${STR}`, "g"),
	new RegExp(String.raw`\bcrumb:\s*${STR}`, "g"),
	new RegExp(String.raw`pageHead\(\{[^}]*?(?:title|description):\s*${STR}(?:[^}]*?description:\s*${STR})?`, "gs"),
	new RegExp(String.raw`\/\*\s*i18n\s*\*\/\s*${STR}`, "g"),
];

const used = new Map();
for (const file of files) {
	const src = fs.readFileSync(file, "utf8");
	for (const re of patterns) {
		for (const m of src.matchAll(re)) {
			for (const s of m.slice(1)) {
				if (s === undefined) continue;
				const key = JSON.parse(`"${s}"`);
				if (!used.has(key)) used.set(key, path.relative(root, file));
			}
		}
	}
}

const frSrc = fs.readFileSync(path.join(root, "lib/i18n/fr.ts"), "utf8");
const { fr } = await import(`data:text/javascript,${encodeURIComponent(frSrc.replace(/: Record<string, string>/, ""))}`);

const missing = [...used].filter(([k]) => !(k in fr));
const unused = Object.keys(fr).filter((k) => !used.has(k));
for (const [k, f] of missing) console.log(`MISSING  ${JSON.stringify(k)}  (${f})`);
if (process.argv.includes("--unused")) for (const k of unused) console.log(`UNUSED   ${JSON.stringify(k)}`);
console.log(`\n${used.size} strings, ${missing.length} missing, ${unused.length} unused`);
process.exit(missing.length ? 1 : 0);
