import type { FetchedResponse, Fetcher } from "./fetcher";
import { homepageUrl, normalizeHost } from "./hosts";
import type { HostResolution } from "./types";

export interface ResolvedHost extends HostResolution {
	/** The homepage response, reused as the site's homepage when this host is the site. */
	homepage?: FetchedResponse;
}

/**
 * Where each brand host lands decides what it is: a site of its own, an alias
 * redirecting to one of the brand's sites, a redirect off the brand's domains,
 * or unreachable.
 */
export async function resolveHosts(fetcher: Fetcher, inputs: string[]): Promise<ResolvedHost[]> {
	const brandHosts = new Set(inputs.map(normalizeHost));
	const resolved: ResolvedHost[] = [];
	for (const input of inputs) {
		const host = normalizeHost(input);
		const fetched = await fetcher.get(homepageUrl(input), { ignoreRobots: true });
		if (fetched.kind !== "response") {
			resolved.push({
				host,
				outcome: "unreachable",
				hops: [],
				error: fetched.kind === "error" ? fetched.message : `Not fetched (${fetched.reason})`,
			});
			continue;
		}
		const finalOrigin = new URL(fetched.url).origin;
		const finalHost = normalizeHost(finalOrigin);
		const ownedByBrand = [...brandHosts].some((brand) => finalHost === brand || finalHost.endsWith(`.${brand}`));
		const outcome = finalHost === host ? "site" : ownedByBrand ? "alias" : "external";
		resolved.push({ host, outcome, finalOrigin, hops: fetched.hops, homepage: fetched });
	}
	return resolved;
}
