import type { AnalyticsScope } from "@/lib/analytics-sql";
import { type ChunkGroup, isPagesChunk, isUrlsChunk, periodChunkId, periodsOverlapping } from "@/lib/brand-data/chunks";
import { windowMinutes } from "@/lib/brand-data/scope";

/** Which of the brand's chunks exist, and which of those have synced. */
export interface Coverage {
	available: ReadonlySet<string>;
	loaded: ReadonlySet<string>;
}

export class MissingChunksError extends Error {
	constructor(readonly chunkIds: string[]) {
		super(`Brand data still syncing: ${chunkIds.join(", ")}`);
	}
}

/** The chunks a read of `group` over the scope's window needs that haven't synced; citations need every page range. */
export function missingChunks(coverage: Coverage, group: ChunkGroup, scope: AnalyticsScope): string[] {
	const { available, loaded } = coverage;
	const { start, end } = windowMinutes(scope);
	const prefix = `${group}:`;
	const periods = [...available].filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
	const needed = periodsOverlapping(periods, start, end).map((period) => periodChunkId(group, period));
	if (group === "citations" && needed.length > 0) needed.push(...[...available].filter(isPagesChunk));
	return needed.filter((id) => !loaded.has(id));
}

export const missingPageText = ({ available, loaded }: Coverage) =>
	[...available].filter((id) => isUrlsChunk(id) && !loaded.has(id));
