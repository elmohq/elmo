import { createServerFn } from "@tanstack/react-start";
import { getAuthSession, hasReportAccess, isAdmin } from "@/lib/auth/helpers";

export interface Viewer {
	session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
	isAdmin: boolean;
	hasReportAccess: boolean;
	impersonating: boolean;
}

export const getViewerFn = createServerFn({ method: "GET" }).handler(async (): Promise<Viewer | null> => {
	const session = await getAuthSession();
	if (!session) return null;
	// customSession's return type drops the fields other plugins add to the session.
	const { impersonatedBy } = session.session as { impersonatedBy?: string | null };
	return {
		session,
		isAdmin: isAdmin(session),
		hasReportAccess: hasReportAccess(session),
		impersonating: Boolean(impersonatedBy),
	};
});
