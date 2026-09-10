/**
 * Which tracked domain covers which. Brand and competitor matching is
 * suffix-based everywhere in the product — `categorizeDomain` and the citation
 * snapshot both walk `inDomainSet` — so tracking `acme.io` already counts
 * `blog.acme.io` as the brand's, and storing both leaves an entry that does
 * nothing.
 */

/**
 * The entry of `set` that `domain` equals or sits under, walking the domain's
 * parent suffixes so lookups stay O(labels) regardless of set size — important
 * for the large editorial set. The nearest ancestor wins.
 */
function coveringDomain(domain: string, set: Set<string>): string | null {
	let d = domain;
	while (true) {
		if (set.has(d)) return d;
		const dot = d.indexOf(".");
		if (dot === -1) return null;
		d = d.slice(dot + 1);
	}
}

/** True if `domain` equals, or is a subdomain of, any entry in `set`. */
export function inDomainSet(domain: string, set: Set<string>): boolean {
	return coveringDomain(domain, set) !== null;
}

/**
 * The entries of `domains` that something broader already covers, mapped to the
 * domain covering them — the website, or another entry in the same list. Each
 * entry is compared against the others rather than against itself, so the
 * broadest member of a chain (`eu.blog.acme.io`, `blog.acme.io`, `acme.io`) is
 * the one that survives, in whatever order they were entered.
 *
 * The website also matches on equality: an additional domain repeating the
 * website is redundant in exactly the same way.
 */
export function findRedundantDomains(domains: string[], website?: string | null): Map<string, string> {
	const unique = [...new Set(domains)];
	const redundant = new Map<string, string>();
	for (const domain of unique) {
		if (website && domain === website) {
			redundant.set(domain, website);
			continue;
		}
		const covering = new Set(unique.filter((other) => other !== domain));
		if (website) covering.add(website);
		const covered = coveringDomain(domain, covering);
		if (covered) redundant.set(domain, covered);
	}
	return redundant;
}

/** `domains` minus the redundant entries — for the paths that correct their input instead of rejecting it. */
export function dropRedundantDomains(domains: string[], website?: string | null): string[] {
	const redundant = findRedundantDomains(domains, website);
	return [...new Set(domains)].filter((domain) => !redundant.has(domain));
}

/** Why a flagged domain is redundant, phrased for a validation message the user reads. */
export function redundantDomainReason(domain: string, covering: string): string {
	return domain === covering ? "already the brand's website" : `already covered by ${covering}`;
}
