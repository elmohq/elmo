import type { Fetched, FetchSkipped } from "../fetcher";
import type { CheckGroup, CheckResult, CheckStatus } from "../types";

export interface CheckDefinition {
	id: string;
	group: CheckGroup;
	title: string;
	fix: string;
}

export function result(
	definition: CheckDefinition,
	status: CheckStatus,
	evidence: string,
	pages?: string[],
): CheckResult {
	const needsFix = status === "fail" || status === "warn" || status === "info";
	return {
		id: definition.id,
		group: definition.group,
		title: definition.title,
		status,
		evidence,
		...(needsFix && { fix: definition.fix }),
		...(pages && pages.length > 0 && { pages }),
	};
}

export function notFetched(definition: CheckDefinition, fetched: Fetched | undefined, what: string): CheckResult {
	const reason =
		fetched?.kind === "skipped"
			? {
					budget: "the request budget ran out",
					robots: "robots.txt disallows ElmoBot",
					"crawl-delay": "robots.txt asks for a Crawl-delay longer than the audit waits",
					"host-stopped": "the site stopped responding normally",
				}[fetched.reason]
			: fetched?.kind === "error"
				? fetched.message
				: "it was not fetched";
	return result(definition, "not_checked", `Couldn't check ${what}: ${reason}.`);
}

export function wasNotFetched(fetched: Fetched | undefined): fetched is FetchSkipped | undefined {
	return fetched === undefined || fetched.kind === "skipped";
}

export function share(part: number, whole: number): string {
	return whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
}

export function list(items: string[]): string {
	return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function count(n: number, singular: string, plural = `${singular}s`): string {
	return `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`;
}
