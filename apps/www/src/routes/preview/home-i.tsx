import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantI } from "@/components/home-preview/i/home";

export const Route = createFileRoute("/preview/home-i")({
	head: () => ({
		meta: [{ title: "Homepage preview I · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantI,
});
