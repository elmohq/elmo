import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// The published skill lives at the repo root so `npx skills add elmohq/elmo` finds it; the site
// serves the same files so `npx skills add elmohq.com` installs an identical copy.
const aeoFiles = import.meta.glob(["../../../../skills/aeo/**/*", "!../../../../skills/aeo/evals/**"], {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

const SKILL_ROOT = "../../../../skills/";

interface Skill {
	name: string;
	/** Relative path inside the skill → contents, always including SKILL.md. */
	files: Map<string, string>;
	archive: Buffer;
}

const INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

function frontmatterDescription(text: string): string {
	const match = text.match(/^description:\s*(.+)$/m);
	if (!match) throw new Error("A published skill must declare a description in its frontmatter");
	return match[1].trim();
}

/**
 * A minimal ustar archive. Entries are sorted and timestamps zeroed so the bytes, and therefore
 * the digest the index advertises, only change when a file does.
 */
function tarGz(files: Map<string, string>): Buffer {
	const blocks: Buffer[] = [];
	for (const [path, text] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
		const body = Buffer.from(text, "utf8");
		const header = Buffer.alloc(512);
		header.write(path, 0, 100, "utf8");
		header.write(`${(path.startsWith("scripts/") ? 0o755 : 0o644).toString(8).padStart(7, "0")}\0`, 100);
		header.write("0000000\0", 108);
		header.write("0000000\0", 116);
		header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
		header.write("00000000000\0", 136);
		header.write("        ", 148);
		header.write("0", 156);
		header.write("ustar\0" + "00", 257);
		let checksum = 0;
		for (const byte of header) checksum += byte;
		header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
		blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
	}
	blocks.push(Buffer.alloc(1024));
	return gzipSync(Buffer.concat(blocks));
}

function loadSkill(name: string, raw: Record<string, string>): Skill {
	const files = new Map<string, string>();
	for (const [path, text] of Object.entries(raw)) {
		files.set(path.slice(SKILL_ROOT.length + name.length + 1), text);
	}
	if (!files.has("SKILL.md")) throw new Error(`Skill ${name} has no SKILL.md`);
	return { name, files, archive: tarGz(files) };
}

const SKILLS: Skill[] = [loadSkill("aeo", aeoFiles)];

export function archivePath(name: string): string {
	return `/.well-known/agent-skills/${name}.tar.gz`;
}

export function findSkillFile(name: string, path: string): string | undefined {
	return SKILLS.find((skill) => skill.name === name)?.files.get(path);
}

export function findSkillArchive(name: string): Buffer | undefined {
	return SKILLS.find((skill) => skill.name === name)?.archive;
}

export const skillsIndex = {
	$schema: INDEX_SCHEMA,
	skills: SKILLS.map(({ name, files, archive }) => ({
		name,
		type: "archive",
		description: frontmatterDescription(files.get("SKILL.md") ?? ""),
		url: archivePath(name),
		digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
	})),
};
