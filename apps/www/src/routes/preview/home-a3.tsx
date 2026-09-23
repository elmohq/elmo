import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantA3 } from "@/components/home-preview/a3/home";

export const Route = createFileRoute("/preview/home-a3")({
	head: () => ({
		meta: [{ title: "Homepage preview A3 · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantA3,
});
