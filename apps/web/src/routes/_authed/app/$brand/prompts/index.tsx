import { createFileRoute, redirect } from "@tanstack/react-router";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/$brand/prompts/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/$brand/visibility",
			params: { brand: params.brand },
		});
	},
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Visibility", { appName, brandName }) },
				{ name: "description", content: "Track how LLMs respond to prompts about your brand." },
			],
		};
	},
});
