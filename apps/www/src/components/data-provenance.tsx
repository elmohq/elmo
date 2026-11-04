import { type Competitor, formatFateDate } from "@/lib/competitors";

const DATA_FILE_URL = "https://github.com/elmohq/elmo/blob/main/apps/www/src/lib/competitors/data.ts";

function correctionIssueUrl(names: string): string {
	const params = new URLSearchParams({
		title: `Correction for ${names}`,
		body: "What's wrong, and where can we see the correct information (a pricing page, docs, or changelog)?\n\n",
	});
	return `https://github.com/elmohq/elmo/issues/new?${params}`;
}

export function DataProvenance({ tools, className = "" }: { tools: Competitor[]; className?: string }) {
	if (tools.length === 0) return null;
	const oldest = tools.map((tool) => tool.checkedAt).sort()[0];
	const names = new Intl.ListFormat("en", { type: "conjunction" }).format(tools.map((tool) => tool.name));
	return (
		<p className={`text-sm text-zinc-500 ${className}`}>
			We last checked {names} against {tools.length === 1 ? "its" : "their"} own site
			{tools.length === 1 ? "" : "s"} in {formatFateDate(oldest.slice(0, 7))}. Spot an error?{" "}
			<a
				href={correctionIssueUrl(names)}
				target="_blank"
				rel="noopener noreferrer"
				className="text-blue-700 hover:underline"
			>
				Suggest a correction
			</a>{" "}
			or{" "}
			<a href={DATA_FILE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
				edit the data on GitHub
			</a>
			.
		</p>
	);
}
