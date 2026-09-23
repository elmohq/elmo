import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantD } from "@/components/home-preview/d/home";

export const Route = createFileRoute("/preview/home-d")({
	head: () => ({
		meta: [{ title: "Homepage preview D · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantD,
});
