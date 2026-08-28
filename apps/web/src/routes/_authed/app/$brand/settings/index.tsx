import { createFileRoute, redirect } from "@tanstack/react-router";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/$brand/settings/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/$brand/settings/brand",
			params: { brand: params.brand },
		});
	},
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Brand Settings", { appName, brandName }) },
				{ name: "description", content: "Manage your brand name and website." },
			],
		};
	},
});
