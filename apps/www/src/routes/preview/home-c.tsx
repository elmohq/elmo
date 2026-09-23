import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantC } from "@/components/home-preview/c/home";

export const Route = createFileRoute("/preview/home-c")({
	head: () => ({
		meta: [{ title: "Homepage preview C · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantC,
});
