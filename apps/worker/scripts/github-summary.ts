export function escapeGitHubSummaryTableCell(value: string): string {
	return value
		.trim()
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("|", "&#124;")
		.replace(/\r\n?|\n/g, "<br>");
}
