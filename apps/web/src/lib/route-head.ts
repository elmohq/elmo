import { routeSubjects } from "@/lib/route-subject";

interface RouteMatchContext {
	context?: {
		clientConfig?: {
			branding?: { name?: string; url?: string; icon?: string };
		};
	};
}

export function getAppName(match: RouteMatchContext): string {
	return match.context?.clientConfig?.branding?.name || "Elmo";
}

export function buildTitle(pageName: string, opts: { appName: string; subject?: string }): string {
	if (opts.subject) {
		return `${pageName} | ${opts.subject} · ${opts.appName}`;
	}
	return `${pageName} · ${opts.appName}`;
}

interface HeadArgs {
	match: RouteMatchContext & { staticData?: { crumb?: string } };
	matches: Array<{ routeId: string; context?: unknown; loaderData?: unknown }>;
}

export function pageHead(page: { title?: string; description?: string }) {
	return ({ match, matches }: HeadArgs) => {
		const { organizationName, brandName } = routeSubjects(matches);
		const name = page.title ?? match.staticData?.crumb;
		const appName = getAppName(match);
		return {
			meta: [
				{ title: name ? buildTitle(name, { appName, subject: brandName ?? organizationName }) : appName },
				...(page.description ? [{ name: "description", content: page.description }] : []),
			],
		};
	};
}
