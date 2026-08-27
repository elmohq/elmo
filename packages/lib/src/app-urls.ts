/**
 * The one place that decides what goes in a `/app/org/$org/brand/$brand` URL.
 *
 * In `@workspace/lib` rather than beside the router because the app is not the
 * only thing that mints these: dunning email links the workspace's billing page,
 * and anything else outside the browser that names a page has to agree with what
 * the router resolves. Pure and dependency-free so both sides can import it.
 *
 * A workspace always has a slug (`organization.slug` is not null). A brand may
 * not: rows that predate slugs have none, and the segment falls back to the id
 * so their links keep working until someone names one.
 */

export interface SluggableOrg {
	slug: string;
}

export interface SluggableBrand {
	id: string;
	slug: string | null;
}

/** What the `$org` segment carries for this workspace. */
export function orgSegment(org: SluggableOrg): string {
	return org.slug;
}

/** What the `$brand` segment carries for this brand. */
export function brandSegment(brand: SluggableBrand): string {
	return brand.slug ?? brand.id;
}

/** Route params for `/app/org/$org`, so the router still type-checks the target. */
export function orgParams(org: SluggableOrg): { org: string } {
	return { org: orgSegment(org) };
}

/** Route params for `/app/org/$org/brand/$brand`. */
export function brandParams(org: SluggableOrg, brand: SluggableBrand): { org: string; brand: string } {
	return { org: orgSegment(org), brand: brandSegment(brand) };
}

/** The canonical URL for a workspace, for links minted outside the router. */
export function workspacePath(org: SluggableOrg): string {
	return `/app/org/${encodeURIComponent(orgSegment(org))}`;
}

export function brandPath(org: SluggableOrg, brand: SluggableBrand): string {
	return `${workspacePath(org)}/brand/${encodeURIComponent(brandSegment(brand))}`;
}

export function workspaceSettingsPath(org: SluggableOrg, sub?: "members" | "billing"): string {
	return sub ? `${workspacePath(org)}/settings/${sub}` : `${workspacePath(org)}/settings`;
}

/**
 * Where each identifier sits in a split `/app/org/$org/brand/$brand` pathname:
 * `["", "app", "org", "<org>", "brand", "<brand>", "<page>", "<sub>"]`.
 *
 * One convention, indexing `pathname.split("/")` with the leading empty string
 * kept — dropping it shifts every index by one, and two parts of the app reading
 * the same URL at different offsets is how breadcrumbs and redirects drift apart.
 */
export const ORG_SEGMENT_INDEX = 3;
export const BRAND_SEGMENT_INDEX = 5;
export const BRAND_PAGE_INDEX = 6;
export const BRAND_SUBPAGE_INDEX = 7;
/** `/app/org/$org/settings/<sub>` — the workspace's own pages. */
export const WORKSPACE_SUBPAGE_INDEX = 5;

/** The segments of a pathname, indexed as the constants above describe. */
export function pathSegments(pathname: string): string[] {
	return pathname.split("/");
}

/**
 * The same URL with one segment swapped for its canonical form.
 *
 * Rebuilt from the parsed pathname, search, and hash rather than sliced out of
 * a serialized href: the segment in the address bar is percent-encoded while
 * the route param is not, so any offset computed from the decoded value lands
 * in the wrong place the moment a slug or id needs encoding.
 */
export function canonicalHref(
	location: { pathname: string; searchStr: string; hash: string },
	segmentIndex: number,
	value: string,
): string {
	const segments = pathSegments(location.pathname);
	segments[segmentIndex] = encodeURIComponent(value);
	return `${segments.join("/")}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`;
}

/**
 * The identifier a pre-workspace `/app/…` link was naming, and whatever
 * followed it.
 *
 * `/app/nike/citations` used to mean "the brand nike"; the same URL now has a
 * workspace where the brand is. Splitting that here — rather than in the server
 * function that looks the name up — keeps the URL arithmetic testable without a
 * database, and keeps `/app/org/…` (the current shape, whose misses are real
 * 404s) from being retried as a brand name.
 *
 * Null for anything that isn't an `/app/<something>` path.
 */
export function parseStrandedAppPath(pathname: string): { candidate: string; rest: string } | null {
	// ["", "app", "<candidate>", ...rest]
	const segments = pathSegments(pathname);
	if (segments[1] !== "app" || !segments[2]) return null;
	if (segments[2] === "org") return null;

	let candidate: string;
	try {
		candidate = decodeURIComponent(segments[2]);
	} catch {
		return null;
	}

	return { candidate, rest: segments.slice(3).join("/") };
}
