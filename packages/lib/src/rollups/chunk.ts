/** Rows per statement, well below Postgres' 65,535 bind parameters. */
export const CHUNK_SIZE = 500;

export function chunked<T>(rows: T[], size = CHUNK_SIZE): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
	return chunks;
}
