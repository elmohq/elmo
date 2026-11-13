/**
 * Read off the handler map the router serves, keyed on a stamp only
 * `createApiHandler` applies: grepping the source would pass a file that calls
 * it and exports something else.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import spec from "@workspace/api-spec";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { type ApiHandlerMeta, apiHandlerMeta } from "../handler";

const V1_ROOT = join(import.meta.dirname, "../../../routes/api/v1");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return routeFiles(full);
		if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) return [];
		return readFileSync(full, "utf8").includes("handlers:") ? [full] : [];
	});
}

function pathForRoute(file: string): string {
	const route = file.slice(V1_ROOT.length + 1).replace(/\.tsx?$/, "");
	const trimmed = route.replace(/\/index$/, "").replace(/^index$/, "");
	return trimmed === "" ? "" : `/${trimmed}`.replace(/\$(\w+)/g, "{$1}");
}

async function handlersOf(file: string): Promise<Record<string, unknown>> {
	const mod = (await import(/* @vite-ignore */ file)) as Record<
		string,
		{ options?: { server?: { handlers?: unknown } } }
	>;
	for (const value of Object.values(mod)) {
		const handlers = value?.options?.server?.handlers;
		if (handlers && typeof handlers === "object") return handlers as Record<string, unknown>;
	}
	throw new Error(`${file} exports no server handlers`);
}

const files = routeFiles(V1_ROOT);
const CATCH_ALL = join(V1_ROOT, "$.ts");

const loaded = await Promise.all(
	files.map(async (file) => ({
		name: file.slice(V1_ROOT.length + 1),
		file,
		path: pathForRoute(file),
		handlers: await handlersOf(file),
	})),
);

const replies = loaded.flatMap((route) =>
	HTTP_METHODS.flatMap((method) => {
		const reply = apiHandlerMeta(route.handlers[method])?.reply;
		return reply ? [[`${method} ${route.path}`, route.path, method, reply] as const] : [];
	}),
);

function documentedOperations(): string[] {
	const operations: string[] = [];
	for (const [path, methods] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
		for (const method of Object.keys(methods)) {
			if ((HTTP_METHODS as readonly string[]).includes(method.toUpperCase())) {
				operations.push(`${method.toUpperCase()} ${path}`);
			}
		}
	}
	return operations;
}

interface DocumentedOperation {
	responses: Record<string, { content?: Record<string, { schema: unknown }> } | undefined>;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `value` with every `$ref` under `prefix` replaced by the schema it names. */
function resolved(value: unknown, schemas: Record<string, unknown>, prefix: string): unknown {
	if (Array.isArray(value)) return value.map((item) => resolved(item, schemas, prefix));
	if (!isObject(value)) return value;
	if (typeof value.$ref === "string" && value.$ref.startsWith(prefix)) {
		const name = value.$ref.slice(prefix.length);
		if (!(name in schemas)) throw new Error(`${value.$ref} names no schema`);
		return resolved(schemas[name], schemas, prefix);
	}
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolved(item, schemas, prefix)]));
}

/** Keywords whose value is a schema, or a list or map of schemas. */
const SUBSCHEMAS = new Set(["items", "additionalProperties", "propertyNames", "not"]);
const SUBSCHEMA_LISTS = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);

/** `rewrite` applied to every schema in `schema`, innermost first. Property names are never read as keywords. */
function rewritten(schema: unknown, rewrite: (node: Record<string, unknown>) => Record<string, unknown>): unknown {
	if (!isObject(schema)) return schema;
	const inner = (value: unknown) => rewritten(value, rewrite);
	const node = Object.fromEntries(
		Object.entries(schema).map(([key, value]) => {
			if (key === "properties" && isObject(value)) {
				return [key, Object.fromEntries(Object.entries(value).map(([name, field]) => [name, inner(field)]))];
			}
			if (SUBSCHEMAS.has(key)) return [key, inner(value)];
			if (SUBSCHEMA_LISTS.has(key) && Array.isArray(value)) return [key, value.map(inner)];
			return [key, value];
		}),
	);
	return rewrite(node);
}

/**
 * The shape the document gives a reply. Its prose and annotations belong to
 * the document alone, so the routes' schemas state none of them. Two shapes
 * the document writes in a form Zod never does are rewritten to Zod's.
 */
function documentedShape(schema: unknown): unknown {
	const shape = resolved(schema, spec.components.schemas as Record<string, unknown>, "#/components/schemas/");
	return rewritten(shape, ({ description: _, example: __, deprecated: ___, "x-stability": ____, ...node }) =>
		nullableSpelled(allOfMerged(node)),
	);
}

/**
 * Zod's JSON Schema, spelled as `openapi.json` spells the same constraint.
 * Each rewrite here is one Zod spells differently: anything else that differs
 * fails the check.
 */
function zodShape(schema: z.ZodType): unknown {
	const { $schema: _, ...root } = z.toJSONSchema(schema);
	return rewritten(root, (node) =>
		nullInEnum(nullableSpelled(withoutPropertyNames(unclosed(withoutImpliedBounds(withoutFormatPattern(node)))))),
	);
}

/** `z.int()` states the safe-integer range, which the document leaves implied. */
function withoutImpliedBounds({ minimum, maximum, ...node }: Record<string, unknown>): Record<string, unknown> {
	if (node.type !== "integer") return { ...node, minimum, maximum };
	return {
		...node,
		...(minimum === Number.MIN_SAFE_INTEGER ? {} : { minimum }),
		...(maximum === Number.MAX_SAFE_INTEGER ? {} : { maximum }),
	};
}

/** Zod closes every object it writes; the document leaves them open. */
function unclosed({ additionalProperties, ...node }: Record<string, unknown>): Record<string, unknown> {
	return additionalProperties === false ? node : { ...node, additionalProperties };
}

/** Zod writes the regex it checks a `format` with; the format alone says it. */
function withoutFormatPattern({ pattern, ...node }: Record<string, unknown>): Record<string, unknown> {
	return node.format === undefined ? { ...node, pattern } : node;
}

/**
 * `.nullable()` is an `anyOf` with `null`; the document adds `null` to the
 * type, except on a `$ref`, where it writes the same `anyOf`.
 */
function nullableSpelled({ anyOf, ...outer }: Record<string, unknown>): Record<string, unknown> {
	const isNull = (branch: unknown) => isObject(branch) && branch.type === "null";
	const others = Array.isArray(anyOf) && anyOf.length === 2 ? anyOf.filter((branch) => !isNull(branch)) : [];
	const [other] = others;
	if (others.length === 1 && isObject(other) && typeof other.type === "string") {
		const stated = Object.fromEntries(Object.entries(outer).filter(([, value]) => value !== undefined));
		return { ...other, ...stated, type: [other.type, "null"] };
	}
	return { ...outer, anyOf };
}

/** `z.record` states its keys are strings; the document leaves that implied. */
function withoutPropertyNames({ propertyNames: _, ...node }: Record<string, unknown>): Record<string, unknown> {
	return node;
}

/** Zod's enum cannot hold `null`; the document lists it among a nullable enum's values. */
function nullInEnum(node: Record<string, unknown>): Record<string, unknown> {
	const { type, enum: values } = node;
	if (!Array.isArray(type) || !type.includes("null") || !Array.isArray(values) || values.includes(null)) return node;
	return { ...node, enum: [...values, null] };
}

/** The document composes objects with `allOf`; Zod writes an intersection of objects as one object. */
function allOfMerged({ allOf, ...node }: Record<string, unknown>): Record<string, unknown> {
	if (!Array.isArray(allOf) || !allOf.every((part) => isObject(part) && part.type === "object")) {
		return allOf === undefined ? node : { ...node, allOf };
	}
	const parts = allOf as Record<string, unknown>[];
	return {
		...node,
		type: "object",
		properties: Object.assign({}, ...parts.map((part) => part.properties)),
		required: parts.flatMap((part) => (Array.isArray(part.required) ? part.required : [])),
	};
}

describe("/api/v1 route conformance", () => {
	it("finds the routes at all", () => {
		// Otherwise the suite passes when the directory moves and every check
		// below iterates an empty list.
		expect(files.length).toBeGreaterThan(10);
	});

	it.each(loaded.map((route) => [route.name, route] as const))(
		"%s authenticates every verb through createApiHandler",
		(_name, route) => {
			const unstamped = Object.entries(route.handlers)
				.filter(([, handler]) => apiHandlerMeta(handler) === undefined)
				.map(([method]) => method);
			expect(unstamped, "verbs wired to something other than createApiHandler").toEqual([]);
		},
	);

	it.each(loaded.map((route) => [route.name, route] as const))(
		"%s rejects the verbs it does not implement",
		(_name, route) => {
			expect(Object.keys(route.handlers).sort()).toEqual([...HTTP_METHODS].sort());
		},
	);

	it.each(loaded.filter((route) => route.file !== CATCH_ALL).map((route) => [route.name, route] as const))(
		"%s enforces the authorization its spec documents",
		(_name, route) => {
			// An empty list is a real answer — /me and /platforms are reachable by
			// any valid key on purpose — so it is compared, not waived.
			const documented: Record<string, unknown> = {};
			const enforced: Record<string, unknown> = {};
			for (const method of HTTP_METHODS) {
				const meta = apiHandlerMeta(route.handlers[method]) as ApiHandlerMeta | undefined;
				if (meta?.kind !== "endpoint") continue;
				const operation = (spec.paths as Record<string, Record<string, Record<string, unknown>>>)[route.path]?.[
					method.toLowerCase()
				];
				// Operations that need no scope inherit the top-level requirement.
				const requirements = (operation?.security ?? spec.security) as Record<string, string[]>[] | undefined;
				// Exactly one requirement naming only the bearer key: an extra `{}`
				// alternative or an empty list would advertise anonymous access.
				expect(
					requirements?.map((requirement) => Object.keys(requirement)),
					`${method} ${route.path}`,
				).toEqual([["BearerAuth"]]);
				documented[method] = {
					scopes: [...(requirements?.[0]?.BearerAuth ?? [])].sort(),
					adminOnly: operation?.["x-elmo-admin-only"] === true,
				};
				enforced[method] = { scopes: [...meta.scopes].sort(), adminOnly: meta.adminOnly };
			}
			expect(enforced).toEqual(documented);
		},
	);

	it.each(loaded.map((route) => [route.name, route] as const))(
		"%s scopes whatever it reads to the caller",
		(_name, route) => {
			// Reads source, because "the rows this returned belong to the caller"
			// isn't visible in the handler map. Catches a route that forgot; the
			// Bruno suite is what demonstrates the rows are actually filtered.
			const source = readFileSync(route.file, "utf8");
			if (!source.includes('from "@workspace/lib/db/db"')) return;
			const scoped = source.includes('from "@/lib/api/scope"');
			const adminOnly = Object.values(route.handlers).some((h) => apiHandlerMeta(h)?.adminOnly === true);
			expect(scoped || adminOnly, "queries the database without scoping to the caller").toBe(true);
		},
	);

	it.each(replies)("%s replies in the shape its spec documents", (_name, path, method, reply) => {
		const documented = (spec.paths as Record<string, Record<string, DocumentedOperation>>)[path]?.[method.toLowerCase()]
			?.responses[String(reply.status)]?.content?.["application/json"]?.schema;
		expect(documented, `no ${reply.status} JSON reply documented`).toBeDefined();
		expect(zodShape(reply.schema)).toEqual(documentedShape(documented));
	});

	it("states the reply of every operation it documents", () => {
		// The shape check above skips a route that states no reply, so without
		// this a new route would pass it by leaving `response` out.
		const stated = new Set<string>(replies.map(([operation]) => operation));
		expect(documentedOperations().filter((operation) => !stated.has(operation))).toEqual([]);
	});

	it("documents exactly the operations it implements", () => {
		const implemented = loaded
			.filter((route) => route.file !== CATCH_ALL)
			.flatMap((route) =>
				Object.entries(route.handlers)
					.filter(([, handler]) => apiHandlerMeta(handler)?.kind === "endpoint")
					.map(([method]) => `${method} ${route.path}`),
			);
		expect(documentedOperations().sort()).toEqual(implemented.sort());
	});
});
