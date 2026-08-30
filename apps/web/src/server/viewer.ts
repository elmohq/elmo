/**
 * Who is signed in, and the two things every shell asks about them.
 *
 * `isAdmin` and `hasReportAccess` are facts about the user, not about any
 * organization, so they are resolved once here rather than riding along with an
 * organization payload — where they would be cached per organization and
 * evicted whenever any one of them changed.
 *
 * The server answers rather than the browser deriving it: `hasReportAccess`
 * also depends on the deployment, and that rule should have one home.
 */
import { createServerFn } from "@tanstack/react-start";
import { getAuthSession, hasReportAccess, isAdmin } from "@/lib/auth/helpers";

export interface Viewer {
	session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
	isAdmin: boolean;
	hasReportAccess: boolean;
}

/** Null for a signed-out caller, which the `_authed` layout turns into a redirect. */
export const getViewerFn = createServerFn({ method: "GET" }).handler(async (): Promise<Viewer | null> => {
	const session = await getAuthSession();
	if (!session) return null;
	return { session, isAdmin: isAdmin(session), hasReportAccess: hasReportAccess(session) };
});
