import robotsParser from "robots-parser";

export interface ParsedRobots {
	isAllowed(url: string, userAgent: string): boolean | undefined;
	getCrawlDelay(userAgent: string): number | undefined;
	sitemaps: string[];
	/** Raw values of `Content-Signal:` lines, e.g. "search=yes, ai-train=no". */
	contentSignals: string[];
	schemamaps: string[];
	userAgents: string[];
}

function directiveValues(text: string, name: string): string[] {
	const pattern = new RegExp(`^\\s*${name}\\s*:\\s*(.+?)\\s*$`, "gim");
	return [...text.matchAll(pattern)].map((match) => match[1] as string);
}

export function parseRobots(robotsUrl: string, text: string): ParsedRobots {
	const robot = robotsParser(robotsUrl, text);
	return {
		isAllowed: (url, userAgent) => robot.isAllowed(url, userAgent),
		getCrawlDelay: (userAgent) => robot.getCrawlDelay(userAgent),
		sitemaps: robot.getSitemaps(),
		contentSignals: directiveValues(text, "content-signal"),
		schemamaps: directiveValues(text, "schemamap"),
		userAgents: directiveValues(text, "user-agent").map((ua) => ua.toLowerCase()),
	};
}
