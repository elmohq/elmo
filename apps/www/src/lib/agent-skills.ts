import { createHash } from "node:crypto";
import elmoAiVisibility from "@/content/skills/elmo-ai-visibility.md?raw";

/**
 * Agent Skills published under /.well-known/agent-skills/, per the discovery
 * RFC at https://github.com/cloudflare/agent-skills-discovery-rfc. Each skill
 * is a single SKILL.md, served verbatim from the string the digest is taken
 * over, so the index can never disagree with what is downloaded.
 */
const SKILLS = [{ name: "elmo-ai-visibility", text: elmoAiVisibility }] as const;

const INDEX_SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/** The `description:` line of the SKILL.md frontmatter, which the index repeats. */
function frontmatterDescription(text: string): string {
	const match = text.match(/^description:\s*(.+)$/m);
	if (!match) throw new Error("A published skill must declare a description in its frontmatter");
	return match[1].trim();
}

export function skillPath(name: string): string {
	return `/.well-known/agent-skills/${name}/SKILL.md`;
}

export function findSkill(name: string): string | undefined {
	return SKILLS.find((skill) => skill.name === name)?.text;
}

export const skillsIndex = {
	$schema: INDEX_SCHEMA,
	skills: SKILLS.map(({ name, text }) => ({
		name,
		type: "skill-md",
		description: frontmatterDescription(text),
		url: skillPath(name),
		digest: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`,
	})),
};
