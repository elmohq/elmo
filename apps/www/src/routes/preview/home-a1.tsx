import { createFileRoute } from "@tanstack/react-router";
import { HomeVariantA1 } from "@/components/home-preview/a1/home";

export const Route = createFileRoute("/preview/home-a1")({
	head: () => ({
		meta: [{ title: "Homepage preview A1 · Elmo" }, { name: "robots", content: "noindex, nofollow" }],
	}),
	component: HomeVariantA1,
});
