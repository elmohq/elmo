/**
 * Longest match wins, so a brand's Prompts doesn't lose to its Settings. An
 * `exact` entry lights only on its own page — a brand's Overview and an
 * organization's Organization are prefixes of every sibling, and matching the
 * prefix would light them everywhere below.
 */
export function activeNavHref(entries: Array<{ href: string; exact?: boolean }>, pathname: string): string {
	let active = "";
	for (const { href, exact } of entries) {
		const onIt = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
		if (onIt && href.length >= active.length) active = href;
	}
	return active;
}
