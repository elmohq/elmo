import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantM } from "@/components/home-preview/m/home";

export const Route = createFileRoute("/preview/home-m")({
	head: () => ({
		meta: [{ title: "Homepage preview M · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantM,
});
