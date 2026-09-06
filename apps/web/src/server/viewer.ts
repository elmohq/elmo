import { createServerFn } from "@tanstack/react-start";
import { getAuthSession, hasReportAccess, isAdmin } from "@/lib/auth/helpers";

export interface Viewer {
	session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
	isAdmin: boolean;
	hasReportAccess: boolean;
}

export const getViewerFn = createServerFn({ method: "GET" }).handler(async (): Promise<Viewer | null> => {
	const session = await getAuthSession();
	if (!session) return null;
	return { session, isAdmin: isAdmin(session), hasReportAccess: hasReportAccess(session) };
});
