import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantE } from "@/components/home-preview/e/home";

export const Route = createFileRoute("/preview/home-e")({
	head: () => ({
		meta: [{ title: "Homepage preview E · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantE,
});
