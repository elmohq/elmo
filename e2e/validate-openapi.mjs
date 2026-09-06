#!/usr/bin/env node
/**
 * Hold the responses the Bruno suite recorded against what the spec promised.
 *
 * Usage: node validate-openapi.mjs <bruno-report.json> [...]
 *
 * A violation is a response the spec says is impossible, and fails the run.
 * Drift — a documented-optional field present every single time — is reported
 * without failing.
 */
import { readFileSync } from "node:fs";

const SPEC = JSON.parse(
	readFileSync(new URL("../packages/api-spec/src/openapi.json", import.meta.url), "utf8"),
);
const BASE_PATH = new URL(SPEC.servers[0].url, "http://x").pathname.replace(/\/$/, "");

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function resolve(schema) {
	if (schema?.$ref) {
		const name = schema.$ref.replace("#/components/schemas/", "");
		return resolve(SPEC.components.schemas[name]);
	}
	if (schema?.allOf) {
		const { allOf, ...siblings } = schema;
		const merged = allOf.map(resolve).reduce(
			(acc, part) => ({
				...acc,
				...part,
				properties: { ...acc.properties, ...part.properties },
				required: [...(acc.required ?? []), ...(part.required ?? [])],
			}),
			{},
		);
		// How OpenAPI 3.0 spells a nullable $ref, which can carry no siblings.
		return {
			...merged,
			...siblings,
			required: [...(merged.required ?? []), ...(siblings.required ?? [])],
		};
	}
	return schema ?? {};
}

const TYPE_OF = (value) =>
	value === null ? "null" : Array.isArray(value) ? "array" : typeof value === "number" ? "number" : typeof value;

function validate(value, rawSchema, where, out) {
	const schema = resolve(rawSchema);
	if (!schema.type && !schema.properties && !schema.enum) return;

	if (value === null) {
		if (!schema.nullable) out.violations.push(`${where}: null, but the spec does not mark it nullable`);
		return;
	}

	const actual = TYPE_OF(value);
	const expected = schema.type;
	if (expected && !(expected === "integer" ? actual === "number" : actual === expected)) {
		out.violations.push(`${where}: expected ${expected}, got ${actual}`);
		return;
	}
	if (schema.enum && !schema.enum.includes(value)) {
		out.violations.push(`${where}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
	}
	if (expected === "integer" && !Number.isInteger(value)) {
		out.violations.push(`${where}: expected an integer, got ${value}`);
	}
	// The only check that catches a unit changing: 0-100 turning into 0..1 is
	// still a number and still non-null.
	if (actual === "number") {
		if (schema.minimum !== undefined && value < schema.minimum) {
			out.violations.push(`${where}: ${value} is below the documented minimum ${schema.minimum}`);
		}
		if (schema.maximum !== undefined && value > schema.maximum) {
			out.violations.push(`${where}: ${value} is above the documented maximum ${schema.maximum}`);
		}
	}

	if (actual === "array") {
		if (schema.items) value.forEach((item, i) => validate(item, schema.items, `${where}[${i}]`, out));
		return;
	}
	if (actual !== "object") return;

	for (const name of schema.required ?? []) {
		if (!(name in value)) out.violations.push(`${where}.${name}: required by the spec, absent from the response`);
	}
	const properties = schema.properties ?? {};
	const optional = new Set(Object.keys(properties).filter((name) => !(schema.required ?? []).includes(name)));
	for (const [name, item] of Object.entries(value)) {
		if (!properties[name]) {
			if (schema.additionalProperties !== false && Object.keys(properties).length === 0) continue;
			out.violations.push(`${where}.${name}: returned but undocumented`);
			continue;
		}
		if (optional.has(name)) {
			const seen = out.optionalSeen.get(`${where.replace(/\[\d+\]/g, "[]")}.${name}`) ?? { present: 0, total: 0 };
			seen.present += item === undefined ? 0 : 1;
			seen.total += 1;
			out.optionalSeen.set(`${where.replace(/\[\d+\]/g, "[]")}.${name}`, seen);
		}
		validate(item, properties[name], `${where}.${name}`, out);
	}
	for (const name of optional) {
		if (name in value) continue;
		const key = `${where.replace(/\[\d+\]/g, "[]")}.${name}`;
		const seen = out.optionalSeen.get(key) ?? { present: 0, total: 0 };
		seen.total += 1;
		out.optionalSeen.set(key, seen);
	}
}

function matchPath(pathname) {
	const actual = pathname.slice(BASE_PATH.length).split("/").filter(Boolean);
	for (const template of Object.keys(SPEC.paths)) {
		const parts = template.split("/").filter(Boolean);
		if (parts.length !== actual.length) continue;
		if (parts.every((part, i) => part.startsWith("{") || part === actual[i])) return template;
	}
	return null;
}

const reports = process.argv.slice(2);
if (reports.length === 0) {
	console.error("usage: validate-openapi.mjs <bruno-report.json> [...]");
	process.exit(2);
}

const out = { violations: [], optionalSeen: new Map() };
const exercised = new Set();
let checked = 0;
let unmatched = 0;

for (const file of reports) {
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch (err) {
		console.error(`could not read ${file}: ${err.message}`);
		process.exit(2);
	}
	for (const iteration of parsed) {
		for (const result of iteration.results ?? []) {
			const status = result.response?.status;
			const body = result.response?.data;
			if (typeof status !== "number" || body === undefined || body === null) continue;

			const pathname = new URL(result.request.url).pathname;
			if (!pathname.startsWith(BASE_PATH)) continue;
			const template = matchPath(pathname);
			if (!template) {
				unmatched += 1;
				continue;
			}
			const operation = SPEC.paths[template][result.request.method.toLowerCase()];
			if (!operation) continue;
			const response = operation.responses[String(status)] ?? operation.responses.default;
			if (!response) {
				out.violations.push(`${result.request.method} ${template}: answered ${status}, which the spec never mentions`);
				continue;
			}
			exercised.add(`${result.request.method} ${template}`);
			const schema = response.content?.["application/json"]?.schema;
			if (!schema) continue;
			validate(body, schema, `${result.request.method} ${template} ${status}`, out);
			checked += 1;
		}
	}
}

const alwaysPresent = [...out.optionalSeen.entries()].filter(
	([, seen]) => seen.total >= 3 && seen.present === seen.total,
);

const documented = [];
for (const [path, methods] of Object.entries(SPEC.paths)) {
	for (const method of Object.keys(methods)) {
		if (METHODS.has(method.toUpperCase())) documented.push(`${method.toUpperCase()} ${path}`);
	}
}
const unexercised = documented.filter((operation) => !exercised.has(operation)).sort();

console.log(`checked ${checked} responses against the spec`);
console.log(`${exercised.size}/${documented.length} documented operations were exercised`);
if (unmatched) console.log(`${unmatched} responses hit no documented path (redirects and unclaimed routes)`);

if (unexercised.length) {
	console.log(`\nnot exercised by any recorded response, so unchecked here:`);
	for (const operation of unexercised) console.log(`  ${operation}`);
}

const unique = [...new Set(out.violations)].sort();
if (unique.length) {
	console.log(`\n${unique.length} response(s) contradict the spec:`);
	for (const violation of unique) console.log(`  ${violation}`);
} else {
	console.log("\nno response contradicted the spec");
}

if (alwaysPresent.length) {
	console.log(`\ndrift — documented optional, but present in every response observed:`);
	for (const [key, seen] of alwaysPresent) console.log(`  ${key} (${seen.present}/${seen.total})`);
}

if (unique.length) process.exit(1);
