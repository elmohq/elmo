import robotsParser from "robots-parser";

export interface ParsedRobots {
	isAllowed(url: string, userAgent: string): boolean | undefined;
	getCrawlDelay(userAgent: string): number | undefined;
	sitemaps: string[];
	contentSignals: string[];
	schemamaps: string[];
	userAgents: string[];
}

// Split by line and trimmed in code, so a long line can't make a lazy pattern backtrack.
function directiveValues(text: string, name: string): string[] {
	return text.split(/\r?\n/).flatMap((line) => {
		const colon = line.indexOf(":");
		if (colon === -1 || line.slice(0, colon).trim().toLowerCase() !== name) return [];
		const value = line.slice(colon + 1).trim();
		return value ? [value] : [];
	});
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
