// Publishes every skill in skills/ at /.well-known/agent-skills, so `npx skills add elmohq.com`
// installs the same files as `npx skills add elmohq/elmo`. Entries are sorted and owners and
// timestamps zeroed, so an archive's digest only changes when one of its files does.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { pack } from "tar-stream";

const SKILLS_DIR = new URL("../../../skills/", import.meta.url).pathname;
const OUT_DIR = new URL("../public/.well-known/agent-skills/", import.meta.url).pathname;

function listFiles(dir) {
	return readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name))
		.sort();
}

async function tarGz(dir) {
	const tar = pack();
	const chunks = [];
	tar.on("data", (chunk) => chunks.push(chunk));
	const done = new Promise((resolve, reject) => tar.on("end", resolve).on("error", reject));
	for (const file of listFiles(dir)) {
		const name = relative(dir, file);
		const mode = name.startsWith("scripts/") ? 0o755 : 0o644;
		tar.entry({ name, mode, mtime: new Date(0), uid: 0, gid: 0, uname: "", gname: "" }, readFileSync(file));
	}
	tar.finalize();
	await done;
	return gzipSync(Buffer.concat(chunks));
}

function description(skillMd) {
	const match = skillMd.match(/^description:\s*(.+)$/m);
	if (!match) throw new Error("SKILL.md has no description");
	return match[1].trim();
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const skills = [];
for (const name of readdirSync(SKILLS_DIR).sort()) {
	const dir = join(SKILLS_DIR, name);
	const archive = await tarGz(dir);
	writeFileSync(join(OUT_DIR, `${name}.tgz`), archive);
	skills.push({
		name,
		type: "archive",
		description: description(readFileSync(join(dir, "SKILL.md"), "utf8")),
		url: `/.well-known/agent-skills/${name}.tgz`,
		digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
	});
}

const index = { $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json", skills };
writeFileSync(join(OUT_DIR, "index.json"), `${JSON.stringify(index, null, "\t")}\n`);
