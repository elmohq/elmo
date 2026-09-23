import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantF } from "@/components/home-preview/f/home";

export const Route = createFileRoute("/preview/home-f")({
	head: () => ({
		meta: [{ title: "Homepage preview F · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantF,
});
