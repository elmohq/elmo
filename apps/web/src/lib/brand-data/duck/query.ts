import { type DataType, type Field, type Table, Type } from "apache-arrow";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/** The parts of a DuckDB connection both the browser's async and Node's blocking builds share. */
export interface DuckConnection {
	query(text: string): Promise<Table> | Table;
	prepare(text: string): Promise<DuckStatement> | DuckStatement;
}

interface DuckStatement {
	query(...params: unknown[]): Promise<Table> | Table;
	close(): Promise<void> | void;
}

const dialect = new PgDialect();

/** Postgres's text form of a timestamp, as drizzle hands it back, or its JSON form inside `json_agg`. */
function pgTimestamp(ms: number, zoned: boolean, json: boolean): string {
	const iso = new Date(ms).toISOString();
	const fraction = iso.slice(19, 23).replace(/\.?0+$/, "");
	return json
		? `${iso.slice(0, 19)}${fraction}${zoned ? "+00:00" : ""}`
		: `${iso.slice(0, 10)} ${iso.slice(11, 19)}${fraction}${zoned ? "+00" : ""}`;
}

/** A `real` as Postgres prints it: the shortest decimal that reads back as the same 32-bit float. */
function pgReal(value: number): number {
	for (let digits = 1; digits < 9; digits++) {
		const shortest = Number(value.toPrecision(digits));
		if (Math.fround(shortest) === value) return shortest;
	}
	return value;
}

const isReal = (type: DataType) =>
	type.typeId === Type.Float && (type as DataType & { precision: number }).precision < 2;

const pgDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A value inside `json_agg`, as node-postgres parses the JSON Postgres sends. */
function jsonValue(value: unknown, type: DataType): unknown {
	if (value === null || value === undefined) return null;
	switch (type.typeId) {
		case Type.Int:
		case Type.Decimal:
			return Number(value);
		case Type.Float:
			return isReal(type) ? pgReal(value as number) : value;
		case Type.Timestamp:
			return pgTimestamp(Number(value), Boolean((type as DataType & { timezone?: string }).timezone), true);
		case Type.Date:
			return pgDate(Number(value));
		case Type.Struct:
			return Object.fromEntries(
				(type.children as Field[]).map((child) => [
					child.name,
					jsonValue((value as Record<string, unknown>)[child.name], child.type),
				]),
			);
		case Type.List:
			return [...(value as Iterable<unknown>)].map((item) => jsonValue(item, (type.children as Field[])[0].type));
		default:
			return value;
	}
}

/** Converts a value the way node-postgres parses the matching Postgres type. */
function converter(field: Field): (value: unknown) => unknown {
	switch (field.type.typeId) {
		case Type.Int:
			return field.type.bitWidth === 64 ? (v) => String(v) : (v) => v;
		case Type.Decimal:
			return (v) => String(v);
		case Type.Timestamp: {
			const zoned = Boolean((field.type as DataType & { timezone?: string }).timezone);
			return (v) => pgTimestamp(Number(v), zoned, false);
		}
		case Type.Date:
			return (v) => pgDate(Number(v));
		case Type.Float:
			return isReal(field.type) ? (v) => pgReal(v as number) : (v) => v;
		case Type.List:
			return (v) => jsonValue(v, field.type);
		default:
			return (v) => v;
	}
}

/** Converts column by column: reading a large result cell by cell walks Arrow's chunks for every value. */
export function toRows<T>(table: Table): T[] {
	const fields = table.schema.fields;
	const rows: Record<string, unknown>[] = Array.from({ length: table.numRows }, () => ({}));
	fields.forEach((field, c) => {
		const convert = converter(field);
		let r = 0;
		for (const value of table.getChildAt(c) ?? []) {
			rows[r++][field.name] = value === null || value === undefined ? null : convert(value);
		}
	});
	return rows as T[];
}

/** Postgres functions the analytics SQL uses that DuckDB lacks or spells differently. */
export async function preparePostgresDialect(conn: DuckConnection) {
	await conn.query("SET TimeZone = 'UTC'");
	await conn.query("CREATE OR REPLACE MACRO cardinality(list) AS len(list)");
	await conn.query(`CREATE OR REPLACE MACRO to_char(value, format) AS
		CASE format WHEN 'YYYY-MM-DD' THEN strftime(value, '%Y-%m-%d') ELSE strftime(value, '%Y-%m-%dT%H:%M:%S') END`);
}

/**
 * Rewrites what a macro can't: `json_agg` takes `ORDER BY`, Postgres escapes `LIKE` patterns with `\\` by default,
 * and parameters cross into DuckDB as JSON, so a whole number would bind as DOUBLE where Postgres infers an integer.
 */
function toDuckSql(text: string, params: unknown[]): string {
	return text
		.replace(/\bjson_agg\(/g, "list(")
		.replace(/\b(I?LIKE) (\$\d+)/g, "$1 $2 ESCAPE '\\'")
		.replace(/\$(\d+)\b/g, (placeholder, n) => {
			const value = params[Number(n) - 1];
			return typeof value === "number" && Number.isInteger(value) ? `(${placeholder}::BIGINT)` : placeholder;
		});
}

/**
 * Runs the server's Postgres queries against DuckDB, returning rows shaped as node-postgres returns them.
 * `inspect` sees each query's text first, and may throw to keep it from running.
 */
export function duckQuery(conn: DuckConnection, inspect?: (text: string) => void) {
	return async <T>(query: SQL): Promise<T[]> => {
		const { sql: text, params } = dialect.sqlToQuery(query);
		inspect?.(text);
		const statement = await conn.prepare(toDuckSql(text, params));
		try {
			return toRows<T>(await statement.query(...params));
		} finally {
			await statement.close();
		}
	};
}
