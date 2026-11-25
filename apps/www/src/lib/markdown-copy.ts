export function markdownCopyPath(pagePath: string): string {
	return `${pagePath.replace(/\/+$/, "") || "/index"}.md`;
}
