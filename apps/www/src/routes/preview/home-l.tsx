import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantL } from "@/components/home-preview/l/home";

export const Route = createFileRoute("/preview/home-l")({
	head: () => ({
		meta: [{ title: "Homepage preview L · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantL,
});
