/**
 * Variants are prompts that share a group: different wordings of one question,
 * each tracked on its own. The oldest prompt of a group leads it.
 */

interface GroupedRow {
	groupId: string;
}

interface StoredRow extends GroupedRow {
	id: string;
	value: string;
	enabled: boolean;
	createdAt: Date | string;
}

/** Groups alphabetically by their lead prompt, each followed by its variants oldest first. */
export function orderByGroup<T extends StoredRow>(rows: readonly T[]): T[] {
	const byAge = [...rows].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id),
	);
	const groups = new Map<string, T[]>();
	for (const row of byAge) {
		const group = groups.get(row.groupId);
		if (group) group.push(row);
		else groups.set(row.groupId, [row]);
	}
	return [...groups.values()]
		.sort(
			([a], [b]) => a.value.localeCompare(b.value) || Number(b.enabled) - Number(a.enabled) || a.id.localeCompare(b.id),
		)
		.flat();
}

export function groupLeads<T extends GroupedRow>(rows: readonly T[]): Map<string, T> {
	const leads = new Map<string, T>();
	for (const row of rows) {
		if (!leads.has(row.groupId)) leads.set(row.groupId, row);
	}
	return leads;
}

/** Placed after the last row of its group, so a group stays together however many variants it gains. */
export function insertIntoGroup<T extends GroupedRow>(rows: readonly T[], entry: T): T[] {
	const last = rows.map((row) => row.groupId).lastIndexOf(entry.groupId);
	if (last === -1) return [...rows, entry];
	return [...rows.slice(0, last + 1), entry, ...rows.slice(last + 1)];
}

/** How many rows are a variant of another, i.e. not the lead of their group. */
export function countVariants(rows: readonly GroupedRow[]): number {
	return rows.length - new Set(rows.map((row) => row.groupId)).size;
}
