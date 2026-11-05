import { stringify } from "yaml";

export function withFrontmatter(markdown: string, data: Record<string, string | undefined>): string {
	const fields = Object.fromEntries(Object.entries(data).filter(([, value]) => value));
	if (Object.keys(fields).length === 0) return markdown;
	return `---\n${stringify(fields, { lineWidth: 0 })}---\n\n${markdown}`;
}
