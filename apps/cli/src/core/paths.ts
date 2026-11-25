import fs from "node:fs/promises";
import path from "node:path";

export function isWithin(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * A path inside the working directory may come from a checkout the user didn't write, so none of its
 * components may be a link. Outside it, only the final component is the user's selection to check.
 */
export async function reachedThroughSymlink(target: string, { allowMissing = false } = {}): Promise<boolean> {
	const resolved = path.resolve(process.cwd(), target);
	const cwd = process.cwd();
	let current = isWithin(cwd, resolved) ? cwd : path.dirname(resolved);
	for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
		current = path.join(current, part);
		const link = await fs.lstat(current).catch(() => undefined);
		if (!link) return !allowMissing;
		if (link.isSymbolicLink()) return true;
	}
	return false;
}
