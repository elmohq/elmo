/**
 * A robots.txt parser and matcher following RFC 9309: groups are keyed by
 * user-agent product token, the longest matching path pattern wins, and Allow
 * beats Disallow on a tie. `*` and `$` in patterns are honored.
 *
 * Pure — no network, no Node built-ins — so both the server handler and the
 * tests can use it directly.
 */

export interface RobotsRule {
	type: "allow" | "disallow";
	/** The raw pattern as written, e.g. `/admin/` or `/*.php$`. */
	pattern: string;
}

export interface RobotsGroup {
	/** Lowercased product tokens this group applies to. */
	agents: string[];
	rules: RobotsRule[];
	crawlDelay?: number;
}

export interface ParsedRobots {
	groups: RobotsGroup[];
	sitemaps: string[];
}

export interface AgentVerdict {
	allowed: boolean;
	/**
	 * The user-agent token whose group governs this bot, `*` for the catch-all,
	 * or null when no group matches (nothing constrains the bot).
	 */
	matchedAgent: string | null;
	/** The winning rule, or null when no pattern matched the path. */
	matchedRule: RobotsRule | null;
	/** Every disallow pattern in the governing group, for "partially blocked". */
	disallowedPatterns: string[];
	crawlDelay?: number;
}

export function parseRobotsTxt(text: string): ParsedRobots {
	const groups: RobotsGroup[] = [];
	const sitemaps: string[] = [];

	let current: RobotsGroup | null = null;
	// Consecutive User-agent lines share one group; the first rule line closes
	// the header, so a later User-agent starts a new group.
	let headerOpen = false;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.split("#")[0].trim();
		if (!line) continue;

		const separator = line.indexOf(":");
		if (separator === -1) continue;

		const field = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();

		switch (field) {
			case "user-agent": {
				if (!value) break;
				if (!current || !headerOpen) {
					current = { agents: [], rules: [] };
					groups.push(current);
					headerOpen = true;
				}
				current.agents.push(value.toLowerCase());
				break;
			}
			case "allow":
			case "disallow": {
				if (!current) break;
				headerOpen = false;
				// An empty value is a no-op: "Disallow:" disallows nothing.
				if (!value) break;
				current.rules.push({ type: field, pattern: value });
				break;
			}
			case "crawl-delay": {
				if (!current) break;
				headerOpen = false;
				const delay = Number.parseFloat(value);
				if (Number.isFinite(delay)) current.crawlDelay = delay;
				break;
			}
			case "sitemap": {
				if (value) sitemaps.push(value);
				break;
			}
		}
	}

	return { groups, sitemaps };
}

/**
 * The group a bot obeys: the longest user-agent token that prefix-matches its
 * name, falling back to `*`. This is why `Googlebot-News` follows a `Googlebot`
 * group when it has none of its own, and why a named group makes the crawler
 * ignore `User-agent: *` entirely.
 */
function selectAgent(groups: RobotsGroup[], userAgent: string): string | null {
	const bot = userAgent.toLowerCase();
	let best: string | null = null;

	for (const group of groups) {
		for (const agent of group.agents) {
			if (agent === "*") continue;
			if (!bot.startsWith(agent)) continue;
			if (!best || agent.length > best.length) best = agent;
		}
	}

	if (best) return best;
	return groups.some((group) => group.agents.includes("*")) ? "*" : null;
}

function patternMatches(pattern: string, path: string): boolean {
	const anchored = pattern.endsWith("$");
	const body = anchored ? pattern.slice(0, -1) : pattern;
	const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

export function evaluate(robots: ParsedRobots, userAgent: string, path: string): AgentVerdict {
	const matchedAgent = selectAgent(robots.groups, userAgent);
	if (!matchedAgent) {
		return { allowed: true, matchedAgent: null, matchedRule: null, disallowedPatterns: [] };
	}

	// Groups repeating the same token are merged, per RFC 9309.
	const applicable = robots.groups.filter((group) => group.agents.includes(matchedAgent));
	const rules = applicable.flatMap((group) => group.rules);
	const crawlDelay = applicable.find((group) => group.crawlDelay !== undefined)?.crawlDelay;

	let winner: RobotsRule | null = null;
	for (const rule of rules) {
		if (!patternMatches(rule.pattern, path)) continue;
		if (!winner) {
			winner = rule;
			continue;
		}
		if (rule.pattern.length > winner.pattern.length) {
			winner = rule;
		} else if (rule.pattern.length === winner.pattern.length && rule.type === "allow") {
			// Equal specificity: the permissive rule wins.
			winner = rule;
		}
	}

	return {
		allowed: winner ? winner.type === "allow" : true,
		matchedAgent,
		matchedRule: winner,
		disallowedPatterns: rules.filter((rule) => rule.type === "disallow").map((rule) => rule.pattern),
		crawlDelay,
	};
}
