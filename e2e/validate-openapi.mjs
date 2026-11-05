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
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const SPEC = JSON.parse(
	readFileSync(new URL("../packages/api-spec/src/openapi.json", import.meta.url), "utf8"),
);
const BASE_PATH = new URL(SPEC.servers[0].url, "http://x").pathname.replace(/\/$/, "");

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const schemaFor = (ref) => SPEC.components.schemas[ref.replace("#/components/schemas/", "")];

/**
 * The spec never declares a response closed, but a field it does not mention is
 * exactly the drift this is here to catch, so every documented object is sealed
 * before Ajv sees it.
 *
 * A branch of an `allOf` is left open, and a branch that is a `$ref` is inlined
 * to leave it that way: `unevaluatedProperties` sees only what its own schema
 * object evaluated, so a sealed branch would reject the properties its sibling
 * contributes.
 */
function seal(node, open = false) {
	if (Array.isArray(node)) return node.map((item) => seal(item));
	if (node === null || typeof node !== "object") return node;

	const out = {};
	for (const [key, value] of Object.entries(node)) {
		out[key] =
			key === "allOf"
				? value.map((branch) => seal(branch.$ref ? schemaFor(branch.$ref) : branch, true))
				: seal(value);
	}
	const describesAnObject = Object.keys(out.properties ?? {}).length > 0;
	if (!open && (describesAnObject || Array.isArray(out.allOf))) out.unevaluatedProperties = false;
	return out;
}

// OpenAPI 3.1 schemas are JSON Schema 2020-12, so Ajv reads them as they stand.
const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
addFormats(ajv);
ajv.addSchema({ $id: "spec", ...seal(SPEC) }, "spec");

const escape = (part) => String(part).replace(/~/g, "~0").replace(/\//g, "~1");
const validators = new Map();

/**
 * Only the success bodies are written inline; every error envelope is a `$ref`
 * into `components/responses`, and those go unchecked unless it is followed.
 */
function responseAt(path, method, status) {
	const response = SPEC.paths[path][method].responses[status];
	if (!response.$ref) {
		return { pointer: `/paths/${escape(path)}/${method}/responses/${escape(status)}`, response };
	}
	const name = response.$ref.split("/").pop();
	return { pointer: `/components/responses/${escape(name)}`, response: SPEC.components.responses[name] };
}

function validatorFor(path, method, status) {
	const pointer = `spec#${responseAt(path, method, status).pointer}/content/${escape("application/json")}/schema`;
	if (!validators.has(pointer)) validators.set(pointer, ajv.compile({ $ref: pointer }));
	return validators.get(pointer);
}

const responseBodySchema = (path, method, status) =>
	responseAt(path, method, status).response.content?.["application/json"]?.schema;

/**
 * A nullable field is an `anyOf` against `{ "type": "null" }`, so a value that
 * fails the real branch also fails the null one. Both of those say nothing the
 * real branch's own error does not.
 */
const isNullableUnionNoise = (error) =>
	error.keyword === "anyOf" ||
	(error.keyword === "type" && error.params.type === "null" && error.schemaPath.includes("/anyOf/"));

function describe(error, where) {
	const at = `${where}${error.instancePath}`;
	if (error.keyword === "unevaluatedProperties") {
		return `${at}/${error.params.unevaluatedProperty}: returned but undocumented`;
	}
	if (error.keyword === "required") {
		return `${at}/${error.params.missingProperty}: required by the spec, absent from the response`;
	}
	if (error.keyword === "type" && Array.isArray(error.params.type)) {
		return `${at}: must be ${error.params.type.join(" or ")}`;
	}
	return `${at}: ${error.message}`;
}

/**
 * The one place that still reads the schema by hand, and it only feeds the
 * advisory drift report — it never decides whether the run passes.
 */
function documented(schema) {
	if (!schema) return { properties: {}, required: [], items: undefined };
	if (schema.$ref) return documented(schemaFor(schema.$ref));
	if (schema.allOf) {
		return schema.allOf.map(documented).reduce(
			(acc, part) => ({
				properties: { ...acc.properties, ...part.properties },
				required: [...acc.required, ...part.required],
				items: acc.items ?? part.items,
			}),
			{ properties: {}, required: [], items: undefined },
		);
	}
	return { properties: schema.properties ?? {}, required: schema.required ?? [], items: schema.items };
}

function trackDrift(value, schema, where, seen) {
	const { properties, required, items } = documented(schema);
	if (Array.isArray(value)) {
		for (const item of value) trackDrift(item, items, `${where}[]`, seen);
		return;
	}
	if (value === null || typeof value !== "object") return;

	for (const [name, property] of Object.entries(properties)) {
		const at = `${where}.${name}`;
		if (!required.includes(name)) {
			const entry = seen.get(at) ?? { present: 0, total: 0 };
			entry.total += 1;
			if (name in value) entry.present += 1;
			seen.set(at, entry);
		}
		if (name in value) trackDrift(value[name], property, at, seen);
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

const violations = [];
const optionalSeen = new Map();
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
			const method = result.request.method.toLowerCase();
			const operation = SPEC.paths[template][method];
			if (!operation) continue;
			const documentedStatus = operation.responses[String(status)] ? String(status) : "default";
			if (!operation.responses[documentedStatus]) {
				violations.push(`${result.request.method} ${template}: answered ${status}, which the spec never mentions`);
				continue;
			}
			exercised.add(`${result.request.method} ${template}`);
			const schema = responseBodySchema(template, method, documentedStatus);
			if (!schema) continue;

			const where = `${result.request.method} ${template} ${status}`;
			const validate = validatorFor(template, method, documentedStatus);
			if (!validate(body)) {
				for (const error of validate.errors) {
					if (!isNullableUnionNoise(error)) violations.push(describe(error, where));
				}
			}
			trackDrift(body, schema, where, optionalSeen);
			checked += 1;
		}
	}
}

const alwaysPresent = [...optionalSeen.entries()].filter(([, seen]) => seen.total >= 3 && seen.present === seen.total);

const documentedOperations = [];
for (const [path, methods] of Object.entries(SPEC.paths)) {
	for (const method of Object.keys(methods)) {
		if (METHODS.has(method.toUpperCase())) documentedOperations.push(`${method.toUpperCase()} ${path}`);
	}
}
const unexercised = documentedOperations.filter((operation) => !exercised.has(operation)).sort();

console.log(`checked ${checked} responses against the spec`);
console.log(`${exercised.size}/${documentedOperations.length} documented operations were exercised`);
if (unmatched) console.log(`${unmatched} responses hit no documented path (redirects and unclaimed routes)`);

if (unexercised.length) {
	console.log(`\nnot exercised by any recorded response, so unchecked here:`);
	for (const operation of unexercised) console.log(`  ${operation}`);
}

const unique = [...new Set(violations)].sort();
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
