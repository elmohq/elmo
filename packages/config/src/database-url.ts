import { parse } from "pg-connection-string";

export interface PostgreSqlConnectionTarget {
	database: string;
	host: string;
	port: string;
	user: string;
}

export function parsePostgreSqlConnectionTarget(
	connectionString: string | undefined,
	variableName = "DATABASE_URL",
): PostgreSqlConnectionTarget {
	if (!connectionString?.trim()) throw new Error(`${variableName} is required`);
	let url: URL;
	try {
		url = new URL(connectionString);
	} catch (error) {
		throw new Error(`${variableName} must be a valid PostgreSQL URL`, { cause: error });
	}
	if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
		throw new Error(`${variableName} must use the postgres or postgresql protocol`);
	}

	let parsed: ReturnType<typeof parse>;
	try {
		for (const name of [...url.searchParams.keys()]) {
			if (["sslcert", "sslkey", "sslrootcert"].includes(name.toLowerCase())) url.searchParams.delete(name);
		}
		parsed = parse(url.toString());
	} catch (error) {
		throw new Error(`${variableName} must be a valid PostgreSQL connection string`, { cause: error });
	}
	const host = Array.isArray(parsed.host) ? parsed.host.join(",") : parsed.host;
	const port = Array.isArray(parsed.port) ? parsed.port.join(",") : parsed.port;
	return {
		database: parsed.database ?? "",
		host: host ?? "",
		port: port === undefined || port === null ? "5432" : String(port),
		user: parsed.user ?? "",
	};
}

export function assertDirectPostgreSqlConnectionString(
	connectionString: string | undefined,
	variableName = "DATABASE_URL_UNPOOLED",
): PostgreSqlConnectionTarget {
	const target = parsePostgreSqlConnectionTarget(connectionString, variableName);
	const implicitFields = (["host", "database", "user"] as const).filter((field) => !target[field].trim());
	if (implicitFields.length > 0) {
		throw new Error(
			`${variableName} must explicitly specify PostgreSQL ${implicitFields.join(", ")} so every runtime resolves the same connection target`,
		);
	}
	const hosts = target.host
		.split(",")
		.map((host) => host.trim().toLowerCase())
		.filter(Boolean);
	const ports = target.port
		.split(",")
		.map((port) => port.trim())
		.filter(Boolean);
	if (hosts.some((host) => /(?:^|[.-])(?:pooler|pgbouncer)(?:[.-]|$)/u.test(host)) || ports.includes("6543")) {
		throw new Error(
			`${variableName} appears to use a transaction pooler; configure the provider's direct PostgreSQL endpoint`,
		);
	}
	return target;
}
