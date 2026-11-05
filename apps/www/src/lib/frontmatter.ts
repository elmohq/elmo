import { stringify } from "yaml";

// YAML 1.1 quoting, so parsers still on 1.1 (gray-matter, PyYAML) read dates and words like "yes" as strings.
export function withFrontmatter(markdown: string, data: Record<string, string | undefined>): string {
	const fields = Object.fromEntries(Object.entries(data).filter(([, value]) => value));
	if (Object.keys(fields).length === 0) return markdown;
	return `---\n${stringify(fields, { lineWidth: 0, version: "1.1" })}---\n\n${markdown}`;
}
