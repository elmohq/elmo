import { createFileRoute, redirect } from "@tanstack/react-router";
import { buildTitle, getAppName, getBrandName } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/$brand/prompts/edit")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/$brand/settings/prompts",
			params: { brand: params.brand },
		});
	},
	head: ({ matches, match }) => {
		const appName = getAppName(match);
		const brandName = getBrandName(matches);
		return {
			meta: [
				{ title: buildTitle("Prompts", { appName, brandName }) },
				{ name: "description", content: "Add, edit, or remove tracked prompts." },
			],
		};
	},
});
