/**
 * A variant is a prompt whose parent is another prompt: a different wording of
 * the parent's question, tracked on its own. Groups are one level deep, and a
 * group's parent is one of its enabled prompts whenever it has any.
 */

interface StoredRow {
	id: string;
	parentId: string | null;
	enabled: boolean;
	createdAt: Date | string;
}

/** The id a prompt shares with its parent and its parent's other variants. */
export function variantGroupOf(row: Pick<StoredRow, "id" | "parentId">): string {
	return row.parentId ?? row.id;
}

function byAge(a: StoredRow, b: StoredRow): number {
	return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);
}

/** Parents alphabetically, each followed by its variants oldest first. */
export function orderByGroup<T extends StoredRow & { value: string }>(rows: readonly T[]): T[] {
	const groups = new Map<string, T[]>();
	for (const row of [...rows].sort(byAge)) {
		const key = variantGroupOf(row);
		const group = groups.get(key) ?? [];
		if (row.parentId === null) group.unshift(row);
		else group.push(row);
		groups.set(key, group);
	}
	return [...groups.values()]
		.sort(
			([a], [b]) => a.value.localeCompare(b.value) || Number(b.enabled) - Number(a.enabled) || a.id.localeCompare(b.id),
		)
		.flat();
}

function topOf(row: StoredRow, byId: ReadonlyMap<string, StoredRow>): StoredRow {
	const seen = new Set<string>();
	let top = row;
	while (top.parentId !== null && !seen.has(top.id)) {
		seen.add(top.id);
		const parent = byId.get(top.parentId);
		if (!parent) break;
		top = parent;
	}
	return top;
}

/**
 * The parent each prompt should have, for those whose stored one is wrong. A
 * variant of a variant moves up to the top prompt, and a group whose parent is
 * disabled or being removed is handed to its oldest enabled prompt, so the
 * prompt that stands for a question is one that is still tracked.
 */
export function settleParents(rows: readonly StoredRow[], removing?: string): Map<string, string | null> {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const groups = new Map<string, StoredRow[]>();
	for (const row of rows) {
		const top = topOf(row, byId).id;
		groups.set(top, [...(groups.get(top) ?? []), row]);
	}

	const changes = new Map<string, string | null>();
	for (const [topId, group] of groups) {
		const members = group.filter((row) => row.id !== removing).sort(byAge);
		const top = members.find((row) => row.id === topId);
		const parent = (top?.enabled ? top : members.find((row) => row.enabled)) ?? top ?? members[0];
		for (const row of members) {
			const parentId = row === parent ? null : parent.id;
			if (row.parentId !== parentId) changes.set(row.id, parentId);
		}
	}
	return changes;
}

interface EditorRow {
	/** Shared by the rows of one question while editing, saved or not. */
	groupId: string;
}

/** The first row of each group, which the editor lists as the parent. */
export function groupLeads<T extends EditorRow>(rows: readonly T[]): Map<string, T> {
	const leads = new Map<string, T>();
	for (const row of rows) {
		if (!leads.has(row.groupId)) leads.set(row.groupId, row);
	}
	return leads;
}

/** Placed after the last row of its group, so a group stays together however many variants it gains. */
export function insertIntoGroup<T extends EditorRow>(rows: readonly T[], entry: T): T[] {
	const last = rows.map((row) => row.groupId).lastIndexOf(entry.groupId);
	if (last === -1) return [...rows, entry];
	return [...rows.slice(0, last + 1), entry, ...rows.slice(last + 1)];
}

/** How many rows are a variant of another. */
export function countVariants(rows: readonly EditorRow[]): number {
	return rows.length - new Set(rows.map((row) => row.groupId)).size;
}
