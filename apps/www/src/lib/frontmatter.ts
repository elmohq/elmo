export interface MarkdownMeta {
	title?: string;
	description?: string;
	canonical?: string;
	lastUpdated?: string;
}

/** YAML frontmatter for a served markdown document; JSON strings are valid YAML scalars. */
export function withFrontmatter(markdown: string, meta: MarkdownMeta): string {
	const fields = [
		["title", meta.title],
		["description", meta.description],
		["canonical", meta.canonical],
		["last_updated", meta.lastUpdated],
	].filter((field): field is [string, string] => Boolean(field[1]));
	if (fields.length === 0) return markdown;
	return `---\n${fields.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${markdown}`;
}
