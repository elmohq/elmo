import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantA2 } from "@/components/home-preview/a2/home";

export const Route = createFileRoute("/preview/home-a2")({
	head: () => ({
		meta: [{ title: "Homepage preview A2 · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantA2,
});
