import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantB } from "@/components/home-preview/b/home";

export const Route = createFileRoute("/preview/home-b")({
	head: () => ({
		meta: [{ title: "Homepage preview B · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantB,
});
