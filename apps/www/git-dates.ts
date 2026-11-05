import { execFileSync } from "node:child_process";

function git(args: string[]): string | undefined {
	try {
		return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return undefined;
	}
}

// A shallow clone (Vercel's default) dates every untouched file by the clone's
// oldest commit, so nothing gets a date unless the full history is there.
const fullHistory = git(["rev-parse", "--is-shallow-repository"]) === "false";

/** When a file last changed in git, or undefined when the history can't say. */
export function lastCommitDate(filePath: string): Date | undefined {
	if (!fullHistory) return undefined;
	const iso = git(["log", "-1", "--format=%cI", "--", filePath]);
	return iso ? new Date(iso) : undefined;
}
